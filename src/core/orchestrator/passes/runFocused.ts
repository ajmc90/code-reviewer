import { Finding } from '../../../types';
import { PassName } from '../../events';
import { parseClaudeOutput } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';
import { runCli } from '../cli';
import { tagPass } from '../helpers';

/**
 * Generic helper for the "build a prompt, call Claude, parse findings" shape
 * used by every specialist + completeness pass.
 */
export async function runFocusedPass(
  deps: OrchestratorDeps,
  lang: 'en' | 'es',
  pass: PassName,
  buildPrompt: () => string,
  tag: Finding['pass'],
): Promise<Finding[]> {
  const { log, events } = deps;
  const prompt = buildPrompt();
  log(`[${pass}] prompt = ${prompt.length} chars (${Math.round(prompt.length / 1024)} KB)`);
  const text = await runCli(deps, prompt, pass);
  log(`[${pass}] response = ${text.length} chars (${Math.round(text.length / 1024)} KB)`);
  const parsed = parseClaudeOutput(text, lang);
  if (parsed.findings.length === 0 && text.length > 0) {
    const preview = text.trim().slice(0, 600).replace(/\s+/g, ' ');
    log(`[${pass}] parsed 0 findings. Response preview: ${preview}${text.length > 600 ? '…' : ''}`);
    events?.emit({
      kind: 'log',
      level: 'warn',
      message: `[${pass}] parsed 0 findings. First 200 chars: ${preview.slice(0, 200)}`,
      at: Date.now(),
    });
  }
  tagPass(parsed.findings, tag);
  return parsed.findings;
}
