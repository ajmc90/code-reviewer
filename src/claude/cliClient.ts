import { spawn } from 'child_process';
import * as vscode from 'vscode';

export interface CliRunOptions {
  cwd: string;
  model?: string;
  timeoutMs?: number;
  onStderr?: (chunk: string) => void;
  onStdout?: (chunk: string) => void;
  signal?: vscode.CancellationToken;
  /**
   * When set, Claude is allowed to use these tools during the run.
   * Use this for the structural exploration pass so Claude can Read/Grep the repo.
   * Example: ['Read', 'Grep', 'Glob']
   */
  allowedTools?: string[];
  /**
   * Session id for prompt-cache reuse across calls. First call with a fresh
   * id creates the session (--session-id). Subsequent calls with the same id
   * + resume=true continue it (--resume <id>), which reuses cache_read for
   * everything the prior call already cached — typically 60-90% cost saving.
   *
   * Reuse requires the SAME set of tools across calls; changing tools (e.g.
   * Read,Grep,Glob → '') invalidates most of the cache.
   */
  sessionId?: string;
  /**
   * When true and sessionId is set, the CLI is invoked with --resume <id>
   * instead of --session-id <id>. Caller is responsible for setting this to
   * true only on calls AFTER a successful first call that created the session.
   */
  resume?: boolean;
}

/**
 * Token usage reported by the Claude CLI for a single run.
 *
 * Key insight from inspecting raw NDJSON: `inputTokens` is NOT the total input
 * — it's only the fresh, non-cacheable portion. The full input the model saw
 * is `inputTokens + cacheCreationTokens + cacheReadTokens`. A pass that reuses
 * a cached context shows `inputTokens=6, cacheReadTokens=50000` rather than
 * `inputTokens=50000`. Treat them as additive when reporting "input the model
 * actually processed", and prefer cacheReadTokens for cost (it's ~10× cheaper).
 *
 * All fields are optional because older CLI versions may not emit them and
 * caching fields only appear when caching actually fires. Null vs 0 is
 * preserved so the telemetry log can distinguish "CLI did not report" from
 * "reported zero".
 */
export interface CliUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/**
 * Per-model usage breakdown from the result event. The CLI internally uses
 * Haiku for some operations (e.g. routing, summarization) and Opus for the
 * main response — so a single "run" can consume tokens against multiple
 * models, each with its own cost. Keyed by model id as the CLI reports it.
 */
export interface CliModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
}

export interface CliToolInvocation {
  name: string;
}

export interface CliResult {
  text: string;
  exitCode: number;
  durationMs: number;
  usage: CliUsage;
  /**
   * Total cost in USD as reported by the CLI's result event. The CLI does the
   * math against current model prices, so we don't have to maintain a price
   * table. Undefined when the CLI didn't include it (older versions / errors).
   */
  costUsd?: number;
  /**
   * Per-model usage + cost breakdown from result.modelUsage. Useful to see
   * Haiku-vs-Opus split — the visible response uses Opus but the CLI may
   * spend Haiku tokens under the hood for routing.
   */
  modelUsage: Record<string, CliModelUsage>;
  toolsInvoked: CliToolInvocation[];
  apiRetries: number;
}

/**
 * Invokes the Claude Code CLI in non-interactive ("print") mode.
 *
 * The CLI is expected to accept the prompt on stdin and respond on stdout
 * with `--print` (alias `-p`). We pass `--output-format text` for a clean
 * single string back. This contract matches Claude Code 1.x behaviour.
 *
 * No API key is needed — the CLI uses the user's local Claude Code login.
 */
export class ClaudeCliClient {
  constructor(private cliPath: string) {}

  async ping(): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await this.run('Reply with the single word PONG.', { cwd: process.cwd(), timeoutMs: 30000 });
      return { ok: /PONG/i.test(r.text) };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  run(prompt: string, opts: CliRunOptions): Promise<CliResult> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      // stream-json gives us per-event updates so the UI can show real progress
      // instead of waiting for the final answer.
      const args = [
        '--print',
        '--verbose',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--include-partial-messages',
      ];
      if (opts.model) args.push('--model', opts.model);
      if (opts.allowedTools && opts.allowedTools.length > 0) {
        args.push('--allowedTools', opts.allowedTools.join(' '));
      } else {
        // Default: no tools — reviews work on the prompt only.
        args.push('--tools', '');
      }
      // Session reuse: --session-id <uuid> creates the session; --resume <uuid>
      // continues an existing one. Mutually exclusive. The CLI rejects
      // --session-id if the id already exists, so the orchestrator must track
      // session lifecycle (first call uses session-id, the rest use resume).
      if (opts.sessionId) {
        if (opts.resume) {
          args.push('--resume', opts.sessionId);
        } else {
          args.push('--session-id', opts.sessionId);
        }
      }

      const proc = spawn(this.cliPath, args, {
        cwd: opts.cwd,
        env: { ...process.env, CLAUDE_NONINTERACTIVE: '1' },
      });

      // Claude CLI in stream-json mode emits the assistant text in THREE
      // overlapping forms — we must pick exactly one, otherwise the final
      // JSON gets duplicated and downstream parsing fails:
      //
      //   1) stream_event text_delta events  (incremental chars while streaming)
      //   2) one `assistant` event with the FULL content                (mid-stream)
      //   3) one `result/success` event with the FULL result            (at end)
      //
      // Source-of-truth selection rules below:
      //   - Prefer the `result` event (canonical, complete, deterministic).
      //   - Fallback to `assistant` event if no result was emitted.
      //   - Fallback to concatenated text_deltas otherwise.
      const streamedText: string[] = [];     // accumulated text_delta chunks
      let assistantText = '';                // text from the `assistant` event
      let resultText = '';                   // text from the final `result` event
      let rawOutput = '';                    // raw NDJSON for debug
      let lineBuf = '';
      let stderr = '';
      let killed = false;
      // Diagnostics surfaced when the CLI exits non-zero. The CLI emits the real
      // failure reason (e.g. SSL/proxy errors, auth refresh failures) as JSON events
      // on stdout — not on stderr — so without this the user sees an empty stderr.
      const diagnostics: string[] = [];
      // Telemetry sinks: usage from message_delta and result events, tools the
      // model invoked, and CLI-level api_retry events. message_delta.usage is
      // accumulative within a single message so the last one wins; result.usage
      // is the canonical end-of-run total when present. costUsd + modelUsage
      // come from the result event only.
      let streamUsage: CliUsage = {};
      let resultUsage: CliUsage | undefined;
      let costUsd: number | undefined;
      let modelUsage: Record<string, CliModelUsage> = {};
      const toolsInvoked: CliToolInvocation[] = [];
      let apiRetries = 0;

      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        reject(new Error(`Claude CLI timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs ?? 600000);

      if (opts.signal) {
        opts.signal.onCancellationRequested(() => {
          killed = true;
          proc.kill('SIGTERM');
          // If the CLI is stuck mid-handshake (e.g. SSL retry loop), SIGTERM
          // can be absorbed. Escalate to SIGKILL so the user can actually
          // cancel and restart.
          setTimeout(() => {
            try {
              if (proc.exitCode === null && proc.signalCode === null) {
                proc.kill('SIGKILL');
              }
            } catch { /* already gone */ }
          }, 2000).unref?.();
          clearTimeout(timeout);
          reject(new Error('Cancelled'));
        });
      }

      proc.stdout.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        rawOutput += s;
        lineBuf += s;
        // process complete NDJSON lines
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          let evt: any;
          try {
            evt = JSON.parse(line);
          } catch {
            // Not JSON — usually a plain-text error (e.g. "API Error: SSL
            // certificate verification failed"). Keep it for the failure message.
            diagnostics.push(line);
            opts.onStdout?.(line);
            continue;
          }
          handleStreamEvent(evt, opts, {
            appendStream: (t) => streamedText.push(t),
            // If the model emits multiple `assistant` events (e.g. tool-use
            // sequences), keep the longest one — it's the most complete.
            setAssistant: (t) => { if (t.length > assistantText.length) assistantText = t; },
            setResult: (t) => { resultText = t; },
            addDiagnostic: (t) => diagnostics.push(t),
            recordStreamUsage: (u) => { streamUsage = mergeUsage(streamUsage, u); },
            recordResultUsage: (u) => { resultUsage = mergeUsage(resultUsage ?? {}, u); },
            recordCost: (c) => { costUsd = c; },
            recordModelUsage: (m) => { modelUsage = m; },
            recordTool: (t) => { toolsInvoked.push(t); },
            recordRetry: () => { apiRetries += 1; },
          });
        }
      });
      proc.stderr.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        stderr += s;
        opts.onStderr?.(s);
      });
      proc.on('error', (e) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude CLI '${this.cliPath}': ${e.message}`));
      });
      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (killed) return;
        if (code !== 0) {
          reject(new Error(buildFailureMessage(this.cliPath, code, stderr, diagnostics, rawOutput)));
          return;
        }

        // Pick the single source of truth for the assistant's text.
        // result > assistant > streamedText.
        let stdout: string;
        let source: 'result' | 'assistant' | 'stream' | 'empty';
        if (resultText && resultText.trim()) {
          stdout = resultText;
          source = 'result';
        } else if (assistantText && assistantText.trim()) {
          stdout = assistantText;
          source = 'assistant';
        } else if (streamedText.length > 0) {
          stdout = streamedText.join('');
          source = 'stream';
        } else {
          stdout = '';
          source = 'empty';
        }

        // Sanity log so future regressions are obvious in the OutputChannel.
        opts.onStderr?.(`[cliClient] response source=${source} length=${stdout.length}`);

        // Prefer result.usage (canonical end-of-run total) over the running
        // stream tally — the latter only sees message_delta increments and
        // misses fields the result event collapses.
        const finalUsage: CliUsage = resultUsage ?? streamUsage;

        resolve({
          text: stdout,
          exitCode: code ?? 0,
          durationMs: Date.now() - start,
          usage: finalUsage,
          costUsd,
          modelUsage,
          toolsInvoked,
          apiRetries,
        });
      });

      // stream-json input expects newline-delimited user messages.
      const userMsg = {
        type: 'user',
        message: { role: 'user', content: prompt },
      };
      proc.stdin.write(JSON.stringify(userMsg) + '\n');
      proc.stdin.end();
    });
  }
}

interface TextSinks {
  appendStream:  (text: string) => void;  // text_delta chunks (mid-stream)
  setAssistant:  (text: string) => void;  // text from `assistant` event
  setResult:     (text: string) => void;  // text from `result/success` event
  addDiagnostic: (text: string) => void;  // api_retry / result error / other failure signals
  recordStreamUsage: (u: CliUsage) => void;  // message_delta.usage (last one wins per message)
  recordResultUsage: (u: CliUsage) => void;  // result.usage (canonical end-of-run total)
  recordCost:    (usd: number) => void;  // result.total_cost_usd
  recordModelUsage: (m: Record<string, CliModelUsage>) => void;  // result.modelUsage
  recordTool:    (t: CliToolInvocation) => void;  // content_block_start tool_use
  recordRetry:   () => void;  // system api_retry event
}

/**
 * Merge two CliUsage objects field-by-field, preferring the incoming non-null
 * value. Used to fold accumulative message_delta.usage into a running total
 * without losing fields the latest event didn't repeat.
 */
function mergeUsage(base: CliUsage, incoming: CliUsage): CliUsage {
  return {
    inputTokens: incoming.inputTokens ?? base.inputTokens,
    outputTokens: incoming.outputTokens ?? base.outputTokens,
    cacheReadTokens: incoming.cacheReadTokens ?? base.cacheReadTokens,
    cacheCreationTokens: incoming.cacheCreationTokens ?? base.cacheCreationTokens,
  };
}

/**
 * Extract token counts from a CLI usage object. The CLI uses snake_case
 * (matching the underlying Anthropic API) for input_tokens, output_tokens,
 * cache_read_input_tokens, cache_creation_input_tokens; we surface camelCase
 * to TypeScript callers.
 */
function extractUsage(raw: any): CliUsage {
  if (!raw || typeof raw !== 'object') return {};
  const num = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    inputTokens: num(raw.input_tokens),
    outputTokens: num(raw.output_tokens),
    cacheReadTokens: num(raw.cache_read_input_tokens),
    cacheCreationTokens: num(raw.cache_creation_input_tokens),
  };
}

/**
 * Extract the per-model usage table from result.modelUsage. The CLI here uses
 * camelCase already (inputTokens, costUSD) — different from the snake_case in
 * the usage object on the same event — so we normalize both directions.
 */
function extractModelUsage(raw: any): Record<string, CliModelUsage> {
  if (!raw || typeof raw !== 'object') return {};
  const num = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const out: Record<string, CliModelUsage> = {};
  for (const [model, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, any>;
    out[model] = {
      inputTokens: num(e.inputTokens),
      outputTokens: num(e.outputTokens),
      cacheReadTokens: num(e.cacheReadInputTokens),
      cacheCreationTokens: num(e.cacheCreationInputTokens),
      costUsd: num(e.costUSD),
    };
  }
  return out;
}

/**
 * Builds a useful failure message when the CLI exits non-zero.
 *
 * The CLI's real failure reason (SSL/proxy errors, auth refresh, rate limits,
 * etc.) is emitted as JSON events on stdout — not stderr. Without surfacing
 * those, the user sees "Stderr:\n" with nothing after it and a misleading
 * "is it installed?" hint. This collects the actual signals.
 */
function buildFailureMessage(
  cliPath: string,
  code: number | null,
  stderr: string,
  diagnostics: string[],
  rawOutput: string,
): string {
  const parts: string[] = [`Claude CLI exited ${code}.`];

  const stderrTail = stderr.trim();
  if (stderrTail) parts.push(`Stderr:\n${stderrTail.slice(-2000)}`);

  if (diagnostics.length > 0) {
    // Keep the last few — for retry loops the final attempt is the most
    // informative, and earlier ones are usually duplicates.
    const tail = diagnostics.slice(-5).join('\n');
    parts.push(`Diagnostics from stdout:\n${tail}`);
  } else if (!stderrTail && rawOutput.trim()) {
    // No structured diagnostics and no stderr — fall back to the raw stdout
    // tail so the user has *something* to look at.
    parts.push(`Raw stdout tail:\n${rawOutput.slice(-1500)}`);
  }

  parts.push(
    `Is '${cliPath}' installed and authenticated? Try running it once in a terminal.`,
  );
  return parts.join('\n\n');
}

/**
 * Interprets a single NDJSON event from `claude --output-format stream-json`.
 *
 * Routes assistant text into the right sink. The CALLER then picks the source
 * of truth (result > assistant > stream) — this function never combines them,
 * which is what caused the duplication bug.
 *
 * Event shapes we care about:
 *
 *   { type: "system", subtype: "init", ... }                          -> startup
 *   { type: "stream_event", event: { type: "message_start", ... } }   -> message begin
 *   { type: "stream_event", event: { type: "content_block_delta",
 *                                    delta: { type: "text_delta", text: "..." } } }
 *   { type: "stream_event", event: { type: "message_delta", usage } }
 *   { type: "assistant", message: { content: [{ type:"text", text:"..." }] } }
 *   { type: "result", subtype: "success", result: "...", usage: ... }
 *   { type: "result", subtype: "error_*", ... }
 */
function handleStreamEvent(evt: any, opts: CliRunOptions, sinks: TextSinks): void {
  const out = opts.onStdout;
  if (!evt || typeof evt !== 'object') return;

  if (evt.type === 'system' && evt.subtype === 'init') {
    out?.(`◇ session ready (model: ${evt.model || 'default'})`);
    return;
  }

  // The CLI emits api_retry events on stdout when the underlying request fails
  // (SSL/proxy issues, transient network errors, auth refresh). Capture them so
  // a final non-zero exit isn't a mystery.
  if (evt.type === 'system' && evt.subtype === 'api_retry') {
    const attempt = evt.attempt ?? '?';
    const max = evt.max_retries ?? '?';
    const reason = evt.error || evt.error_status || 'unknown';
    const msg = `api_retry attempt=${attempt}/${max} reason=${reason}`;
    sinks.addDiagnostic(msg);
    sinks.recordRetry();
    out?.(`↻ ${msg}`);
    return;
  }

  if (evt.type === 'stream_event' && evt.event) {
    const inner = evt.event;
    if (inner.type === 'message_start') {
      out?.('◇ message_start');
      return;
    }
    if (inner.type === 'content_block_start') {
      const kind = inner.content_block?.type;
      if (kind === 'thinking') out?.('… thinking');
      else if (kind === 'text') out?.('▸ writing response');
      else if (kind === 'tool_use') {
        const name = inner.content_block?.name ?? '?';
        const input = inner.content_block?.input;
        const hint = input ? truncate(typeof input === 'string' ? input : JSON.stringify(input), 120) : '';
        out?.(`⚙ tool: ${name}${hint ? ' · ' + hint : ''}`);
        sinks.recordTool({ name });
      }
      return;
    }
    if (inner.type === 'content_block_delta' && inner.delta?.type === 'input_json_delta') {
      const j = inner.delta.partial_json;
      if (typeof j === 'string' && j.length > 0 && j.length < 200) out?.(`  ${truncate(j, 120)}`);
      return;
    }
    if (inner.type === 'content_block_delta' && inner.delta) {
      if (inner.delta.type === 'text_delta' && typeof inner.delta.text === 'string') {
        sinks.appendStream(inner.delta.text);
        out?.(inner.delta.text);
        return;
      }
      if (inner.delta.type === 'thinking_delta' && typeof inner.delta.thinking === 'string') {
        const t = inner.delta.thinking;
        if (t.length > 0) out?.(`… ${truncate(t, 200)}`);
        return;
      }
    }
    if (inner.type === 'message_delta' && inner.usage) {
      const u = inner.usage;
      // Show the full input picture: fresh input + cache reads + cache creation.
      // Reporting only input_tokens makes cached runs look ~6 tokens of input
      // which is misleading — the model actually saw much more, just cached.
      const cacheRead = u.cache_read_input_tokens;
      const cacheCreate = u.cache_creation_input_tokens;
      const cacheParts: string[] = [];
      if (typeof cacheRead === 'number' && cacheRead > 0) cacheParts.push(`cache_read=${cacheRead}`);
      if (typeof cacheCreate === 'number' && cacheCreate > 0) cacheParts.push(`cache_create=${cacheCreate}`);
      const cacheStr = cacheParts.length > 0 ? ` ${cacheParts.join(' ')}` : '';
      out?.(`◇ usage: in=${u.input_tokens ?? '?'} out=${u.output_tokens ?? '?'}${cacheStr}`);
      sinks.recordStreamUsage(extractUsage(u));
      return;
    }
    if (inner.type === 'message_stop') {
      out?.('◇ message complete');
      return;
    }
    return;
  }

  if (evt.type === 'assistant' && evt.message?.content) {
    // Full assistant message in one shot — accumulate into the assistant sink.
    let combined = '';
    for (const part of evt.message.content) {
      if (part?.type === 'text' && typeof part.text === 'string') {
        combined += part.text;
      }
    }
    if (combined) sinks.setAssistant(combined);
    return;
  }

  if (evt.type === 'result') {
    // The result event carries the canonical end-of-run usage in either shape:
    //   { type: 'result', usage: {...} }                  // older CLI
    //   { type: 'result', message: { usage: {...} } }    // newer CLI nests it
    // Record whichever appears; mergeUsage handles missing fields gracefully.
    if (evt.usage) sinks.recordResultUsage(extractUsage(evt.usage));
    if (evt.message?.usage) sinks.recordResultUsage(extractUsage(evt.message.usage));
    // total_cost_usd is the CLI's own price calculation across all models the
    // run touched (Haiku for routing, Opus for the visible response). Trust it
    // rather than maintaining our own per-token price table — the CLI knows
    // its own pricing better than we ever will.
    if (typeof evt.total_cost_usd === 'number' && Number.isFinite(evt.total_cost_usd)) {
      sinks.recordCost(evt.total_cost_usd);
    }
    if (evt.modelUsage && typeof evt.modelUsage === 'object') {
      sinks.recordModelUsage(extractModelUsage(evt.modelUsage));
    }
    if (evt.subtype === 'success' && typeof evt.result === 'string') {
      sinks.setResult(evt.result);
    } else if (evt.subtype && evt.subtype !== 'success') {
      const detail = evt.error || evt.message || evt.result || '';
      const msg = detail ? `result ${evt.subtype}: ${truncate(String(detail), 400)}` : `result ${evt.subtype}`;
      sinks.addDiagnostic(msg);
      out?.(`✗ ${msg}`);
    }
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
