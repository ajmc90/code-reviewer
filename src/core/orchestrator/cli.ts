import { CliResult } from '../../claude/cliClient';
import { PassName } from '../events';
import { OrchestratorDeps } from './types';
import { SessionState, markSessionInitialized, resetSession } from './sessionManager';

/**
 * Wrappers around the raw CLI client that add per-pass instrumentation: text
 * log line (existing), stderr forwarding, and stdout chunks routed to the
 * panel's live log. They return the full CliResult so callers also get usage
 * tokens, tools invoked, and api retries for telemetry.
 *
 * Both wrappers participate in session reuse when deps.sessions is set:
 *   - runCliWithTools uses deps.sessions.withTools (for structural pass)
 *   - runCli uses deps.sessions.noTools (for everything else)
 * The first call to each session uses --session-id; subsequent calls use
 * --resume and reuse the prompt cache for ~60-90% cost saving.
 */
export async function runCliWithTools(
  deps: OrchestratorDeps,
  prompt: string,
  pass: PassName,
  allowedTools: string[],
): Promise<CliResult> {
  return runWithSession(deps, prompt, pass, deps.sessions?.withTools, allowedTools);
}

export async function runCli(deps: OrchestratorDeps, prompt: string, pass: PassName): Promise<CliResult> {
  return runWithSession(deps, prompt, pass, deps.sessions?.noTools);
}

/**
 * Core runner that handles session lifecycle + the one-shot retry when
 * --resume fails because the prior session was lost (CLI restart, expiry,
 * etc.). When the retry happens, we reset the session and try again as a
 * fresh --session-id — that call pays for cache_creation but the review
 * succeeds.
 */
async function runWithSession(
  deps: OrchestratorDeps,
  prompt: string,
  pass: PassName,
  session: SessionState | undefined,
  allowedTools?: string[],
): Promise<CliResult> {
  try {
    return await invokeCli(deps, prompt, pass, session, allowedTools, /* isRetry */ false);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    const isResumeFailure =
      session?.initialized &&
      (/session.*not found/i.test(msg) ||
        /session.*expired/i.test(msg) ||
        /resume.*failed/i.test(msg) ||
        /no such session/i.test(msg));
    if (!isResumeFailure) throw err;
    deps.log(`[claude:${pass}] resume of session ${session!.sessionId} failed (${msg}); retrying with fresh session`);
    resetSession(session!);
    return await invokeCli(deps, prompt, pass, session, allowedTools, /* isRetry */ true);
  }
}

async function invokeCli(
  deps: OrchestratorDeps,
  prompt: string,
  pass: PassName,
  session: SessionState | undefined,
  allowedTools: string[] | undefined,
  isRetry: boolean,
): Promise<CliResult> {
  const events = deps.events;
  const r = await deps.cli.run(prompt, {
    cwd: deps.workspaceRoot,
    model: deps.model,
    timeoutMs: deps.cliTimeoutMs ?? 600000,
    allowedTools,
    sessionId: session?.sessionId,
    resume: session ? session.initialized : false,
    onStderr: (s) => {
      deps.log(`[claude:${pass}:stderr] ${s.trim()}`);
      events?.emit({ kind: 'log', level: 'warn', message: s.trim(), at: Date.now() });
    },
    onStdout: (s) => {
      events?.emit({ kind: 'passOutput', pass, chunk: s, at: Date.now() });
    },
    signal: deps.token,
  });
  if (session) markSessionInitialized(session);
  const toolsHint = allowedTools && allowedTools.length > 0 ? ` (with tools: ${allowedTools.join(',')})` : '';
  const retryHint = isRetry ? ' [retried after resume failure]' : '';
  deps.log(`[claude:${pass}] ${r.text.length} chars in ${r.durationMs}ms${toolsHint}${retryHint}`);
  return r;
}
