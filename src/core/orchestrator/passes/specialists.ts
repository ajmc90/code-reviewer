import { PartialReviewState } from '../../../types';
import {
  buildSecurityPrompt,
  buildPerformancePrompt,
  buildAccessibilityPrompt,
  buildTestsPrompt,
  toFindingIndex,
} from '../../../claude/prompts';
import { detectUiFiles } from '../../../context/fileContext';
import { OrchestratorDeps } from '../types';
import { PlannedPass } from '../passRunner';
import { runFocusedPass } from './runFocused';

export function buildSpecialistPasses(deps: OrchestratorDeps, state: PartialReviewState): PlannedPass[] {
  return [
    {
      pass: 'security',
      label: 'Security',
      phase: 'specialists',
      increment: 12,
      condition: state.opts.passes.security,
      run: () =>
        runFocusedPass(
          deps,
          state.opts.lang,
          'security',
          () =>
            buildSecurityPrompt({
              ctx: state.ctx,
              diff: state.enrichedDiff,
              changeMap: state.changeMap,
              priorFindings: toFindingIndex(state.findings),
              lang: state.opts.lang,
            }),
          'security',
        ),
    },
    {
      pass: 'performance',
      label: 'Performance',
      phase: 'specialists',
      increment: 12,
      condition: state.opts.passes.performance,
      run: () =>
        runFocusedPass(
          deps,
          state.opts.lang,
          'performance',
          () =>
            buildPerformancePrompt({
              ctx: state.ctx,
              diff: state.enrichedDiff,
              changeMap: state.changeMap,
              priorFindings: toFindingIndex(state.findings),
              lang: state.opts.lang,
            }),
          'performance',
        ),
    },
    {
      pass: 'accessibility',
      label: 'Accessibility',
      phase: 'specialists',
      increment: 10,
      condition: state.opts.passes.accessibility,
      conditionalSkip: (s) => (detectUiFiles(s.changedFiles).length === 0 ? 'No UI files in this diff' : null),
      run: () =>
        runFocusedPass(
          deps,
          state.opts.lang,
          'accessibility',
          () =>
            buildAccessibilityPrompt({
              ctx: state.ctx,
              diff: state.enrichedDiff,
              uiFiles: detectUiFiles(state.changedFiles),
              changeMap: state.changeMap,
              priorFindings: toFindingIndex(state.findings),
              lang: state.opts.lang,
            }),
          'accessibility',
        ),
    },
    {
      pass: 'tests',
      label: 'Tests',
      phase: 'specialists',
      increment: 10,
      condition: state.opts.passes.tests,
      run: () =>
        runFocusedPass(
          deps,
          state.opts.lang,
          'tests',
          () =>
            buildTestsPrompt({
              ctx: state.ctx,
              diff: state.enrichedDiff,
              changeMap: state.changeMap,
              priorFindings: toFindingIndex(state.findings),
              lang: state.opts.lang,
            }),
          'tests',
        ),
    },
  ];
}
