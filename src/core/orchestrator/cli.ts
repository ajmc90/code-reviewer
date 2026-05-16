import { PassName } from '../events';
import { OrchestratorDeps } from './types';

export async function runCliWithTools(
  deps: OrchestratorDeps,
  prompt: string,
  pass: PassName,
  allowedTools: string[],
): Promise<string> {
  const events = deps.events;
  const r = await deps.cli.run(prompt, {
    cwd: deps.workspaceRoot,
    model: deps.model,
    timeoutMs: deps.cliTimeoutMs ?? 600000,
    allowedTools,
    onStderr: (s) => {
      deps.log(`[claude:${pass}:stderr] ${s.trim()}`);
      events?.emit({ kind: 'log', level: 'warn', message: s.trim(), at: Date.now() });
    },
    onStdout: (s) => {
      events?.emit({ kind: 'passOutput', pass, chunk: s, at: Date.now() });
    },
    signal: deps.token,
  });
  deps.log(`[claude:${pass}] ${r.text.length} chars in ${r.durationMs}ms (with tools: ${allowedTools.join(',')})`);
  return r.text;
}

export async function runCli(deps: OrchestratorDeps, prompt: string, pass: PassName): Promise<string> {
  const events = deps.events;
  const r = await deps.cli.run(prompt, {
    cwd: deps.workspaceRoot,
    model: deps.model,
    timeoutMs: deps.cliTimeoutMs ?? 600000,
    onStderr: (s) => {
      deps.log(`[claude:${pass}:stderr] ${s.trim()}`);
      events?.emit({ kind: 'log', level: 'warn', message: s.trim(), at: Date.now() });
    },
    onStdout: (s) => {
      events?.emit({ kind: 'passOutput', pass, chunk: s, at: Date.now() });
    },
    signal: deps.token,
  });
  deps.log(`[claude:${pass}] ${r.text.length} chars in ${r.durationMs}ms`);
  return r.text;
}
