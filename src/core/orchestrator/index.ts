import { PartialReviewState, ReviewOptions, ReviewResult, isVisibleFinding } from '../../types';
import { PassName } from '../events';
import { OrchestratorDeps } from './types';
import { bootstrapState, hydrateForResume, computePlannedPasses } from './state';
import { runRemainingPasses } from './phaseLoop';
import { makeSummary } from './passes/summary';
import { report } from './helpers';

export { ReviewPausedError } from './errors';
export type { OrchestratorDeps } from './types';

export class ReviewOrchestrator {
  constructor(private deps: OrchestratorDeps) {}

  async review(opts: ReviewOptions): Promise<ReviewResult> {
    const start = Date.now();
    const { events } = this.deps;

    const state: PartialReviewState = this.deps.resumeFrom
      ? hydrateForResume(this.deps, this.deps.resumeFrom)
      : await bootstrapState(this.deps, opts);

    // Compute the actual list of passes this run will execute and stash it on
    // state so the resume path / paused banner can read it later. The summary
    // pass is always tacked on at the end after runRemainingPasses returns.
    state.plannedPasses = computePlannedPasses(state);

    // Emit 'start' AFTER bootstrap so plannedPasses is accurate. The UI uses
    // it to render correct progress fractions ("2/4" not "2/12").
    events?.emit({
      kind: 'start',
      baseBranch: opts.baseBranch,
      headBranch: opts.headBranch,
      plannedPasses: [...state.plannedPasses, 'summary'] as PassName[],
      at: Date.now(),
    });

    // Snapshot the freshly built state so even an immediate failure doesn't
    // force re-collecting context on retry.
    this.deps.onStateSnapshot?.(state);

    await runRemainingPasses(this.deps, state);

    // Match the message style of every other pass (just the pass name) so the
    // VS Code notification tooltip reads consistently as "Reviewing X: Final
    // summary" instead of switching to a verbose verb phrase only here.
    report(this.deps.progress, this.deps.log, 'Final summary', 5);
    events?.emit({ kind: 'phaseStart', phase: 'critique', at: Date.now() });
    events?.emit({ kind: 'passStart', pass: 'summary', label: 'Final summary', at: Date.now() });
    const summaryStart = Date.now();
    const summary = await makeSummary(this.deps, state.opts, state.ctx, state.stat, state.findings);
    events?.emit({ kind: 'passDone', pass: 'summary', findingCount: 0, durationMs: Date.now() - summaryStart, at: Date.now() });

    const result: ReviewResult = {
      summary: {
        ...summary,
        branch: state.opts.headBranch,
        baseBranch: state.opts.baseBranch,
        filesChanged: state.stat.filesChanged,
        linesAdded: state.stat.insertions,
        linesRemoved: state.stat.deletions,
      },
      findings: state.findings,
      passesRun: [...state.completedPasses],
      durationMs: Date.now() - start,
    };
    events?.emit({
      kind: 'done',
      verdict: result.summary.overallVerdict,
      durationMs: result.durationMs,
      findingCount: state.findings.filter(isVisibleFinding).length,
      at: Date.now(),
    });
    return result;
  }
}
