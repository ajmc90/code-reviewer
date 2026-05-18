import { ChangeMapEntry, Finding, PartialReviewState } from '../../../types';
import { buildExplorePrompt } from '../../../claude/prompts';
import { parseClaudeOutput } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';
import { runCli } from '../cli';
import { tagPass } from '../helpers';
import { PassMetrics, metricsFromCliResult } from '../metrics';

export async function runExplorePass(
  deps: OrchestratorDeps,
  state: PartialReviewState,
): Promise<{ findings: Finding[]; changeMap: ChangeMapEntry[]; metrics: PassMetrics }> {
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
  const r = await runCli(deps, prompt, 'explore');
  log(`[explore] response = ${r.text.length} chars (${Math.round(r.text.length / 1024)} KB)`);
  const parsed = parseClaudeOutput(r.text, state.opts.lang);
  tagPass(parsed.findings, 'explore');
  return {
    findings: parsed.findings,
    changeMap: parsed.changeMap ?? [],
    metrics: metricsFromCliResult(r, prompt.length),
  };
}
