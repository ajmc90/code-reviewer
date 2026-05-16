import { ChangeMapEntry, Finding, PartialReviewState } from '../../../types';
import { buildExplorePrompt } from '../../../claude/prompts';
import { parseClaudeOutput } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';
import { runCli } from '../cli';
import { tagPass } from '../helpers';

export async function runExplorePass(
  deps: OrchestratorDeps,
  state: PartialReviewState,
): Promise<{ findings: Finding[]; changeMap: ChangeMapEntry[] }> {
  const { log } = deps;
  const prompt = buildExplorePrompt({
    ctx: state.ctx,
    depth: state.opts.depth,
    baseBranch: state.opts.baseBranch,
    headBranch: state.opts.headBranch,
    diff: state.enrichedDiff,
    conventions: state.conventions,
    changedFiles: state.changedFiles,
    extraContext: '',
    structuralRisks: state.structuralRisks,
    lang: state.opts.lang,
  });
  log(`[explore] prompt = ${prompt.length} chars (${Math.round(prompt.length / 1024)} KB)`);
  const text = await runCli(deps, prompt, 'explore');
  log(`[explore] response = ${text.length} chars (${Math.round(text.length / 1024)} KB)`);
  const parsed = parseClaudeOutput(text, state.opts.lang);
  tagPass(parsed.findings, 'explore');
  return { findings: parsed.findings, changeMap: parsed.changeMap ?? [] };
}
