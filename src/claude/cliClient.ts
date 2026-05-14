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
}

export interface CliResult {
  text: string;
  exitCode: number;
  durationMs: number;
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

      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        reject(new Error(`Claude CLI timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs ?? 600000);

      if (opts.signal) {
        opts.signal.onCancellationRequested(() => {
          killed = true;
          proc.kill('SIGTERM');
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
            // Not JSON — pass through as a stdout chunk so the UI sees something
            opts.onStdout?.(line);
            continue;
          }
          handleStreamEvent(evt, opts, {
            appendStream: (t) => streamedText.push(t),
            // If the model emits multiple `assistant` events (e.g. tool-use
            // sequences), keep the longest one — it's the most complete.
            setAssistant: (t) => { if (t.length > assistantText.length) assistantText = t; },
            setResult: (t) => { resultText = t; },
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
          reject(
            new Error(
              `Claude CLI exited ${code}. Stderr:\n${stderr.slice(-2000)}\n\nIs '${this.cliPath}' installed and authenticated? Try running it once in a terminal.`,
            ),
          );
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

        resolve({ text: stdout, exitCode: code ?? 0, durationMs: Date.now() - start });
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
  appendStream: (text: string) => void;   // text_delta chunks (mid-stream)
  setAssistant: (text: string) => void;   // text from `assistant` event
  setResult:    (text: string) => void;   // text from `result/success` event
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
      out?.(`◇ usage: in=${u.input_tokens ?? '?'} out=${u.output_tokens ?? '?'}`);
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
    if (evt.subtype === 'success' && typeof evt.result === 'string') {
      sinks.setResult(evt.result);
    } else if (evt.subtype && evt.subtype !== 'success') {
      out?.(`✗ result: ${evt.subtype}`);
    }
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
