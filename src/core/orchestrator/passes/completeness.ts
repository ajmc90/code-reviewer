import { PartialReviewState } from '../../../types';
import { buildGapsPrompt, buildPermutePrompt, toFindingIndex } from '../../../claude/prompts';
import { OrchestratorDeps } from '../types';
import { PlannedPass } from '../passRunner';
import { runFocusedPass } from './runFocused';

export function buildCompletenessPasses(deps: OrchestratorDeps, state: PartialReviewState): PlannedPass[] {
  return [
    {
      pass: 'gaps',
      label: 'Gaps',
      phase: 'completeness',
      increment: 10,
      condition: state.opts.passes.gaps,
      run: () =>
        runFocusedPass(
          deps,
          state.opts.lang,
          'gaps',
          () =>
            buildGapsPrompt({
              ctx: state.ctx,
              diff: state.enrichedDiff,
              conventions: state.conventions,
              changedFiles: state.changedFiles,
              changeMap: state.changeMap,
              priorFindings: toFindingIndex(state.findings),
              lang: state.opts.lang,
            }),
          'gaps',
        ),
    },
    {
      pass: 'permute',
      label: 'Alternatives',
      phase: 'completeness',
      increment: 10,
      condition: state.opts.passes.permute && (state.opts.depth === 'deep' || state.opts.depth === 'obsessive'),
      conditionalSkip: (s) => {
        const hasCritical = s.findings.some((f) => f.severity === 'critical' || f.severity === 'major');
        return hasCritical ? null : 'No critical or major findings to alternativize';
      },
      run: () => {
        const critical = toFindingIndex(state.findings.filter((f) => f.severity === 'critical' || f.severity === 'major'));
        return runFocusedPass(
          deps,
          state.opts.lang,
          'permute',
          () =>
            buildPermutePrompt({
              ctx: state.ctx,
              depth: state.opts.depth,
              diff: state.enrichedDiff,
              criticalFindings: critical,
              lang: state.opts.lang,
            }),
          'permute',
        );
      },
    },
  ];
}
