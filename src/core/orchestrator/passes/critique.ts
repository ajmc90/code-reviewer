import { Finding, PartialReviewState } from '../../../types';
import { buildCritiquePrompt } from '../../../claude/prompts';
import { OrchestratorDeps } from '../types';
import { stripIdForPrompt } from '../helpers';
import { runFocusedPass } from './runFocused';

export async function runCritiquePass(deps: OrchestratorDeps, state: PartialReviewState): Promise<Finding[]> {
  return runFocusedPass(
    deps,
    state.opts.lang,
    'critique',
    () =>
      buildCritiquePrompt({
        ctx: state.ctx,
        depth: state.opts.depth,
        priorFindingsJson: JSON.stringify(state.findings.map(stripIdForPrompt)),
        diff: state.enrichedDiff,
        lang: state.opts.lang,
      }),
    'critique',
  );
}
