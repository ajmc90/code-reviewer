import { PartialReviewState, ReviewPhase, Finding } from '../../types';
import { PassFailureDecision, PassName } from '../events';
import { OrchestratorDeps } from './types';
import { linkRelatedFindings } from '../../claude/parser';
import { ReviewPausedError } from './errors';
import { report, checkCancel } from './helpers';

export interface PlannedPass {
  pass: PassName;
  label: string;
  phase: ReviewPhase;
  increment: number;
  condition: boolean;
  /** Optional runtime check; if it returns a non-null string the pass is skipped with that reason. */
  conditionalSkip?: (state: PartialReviewState) => string | null;
  replaceAll?: boolean;
  /** Returns the findings for this pass (or [] if none). May throw on CLI failure. */
  run: () => Promise<Finding[]>;
}

export function shouldRun(deps: OrchestratorDeps, pass: PassName, state: PartialReviewState): boolean {
  if (deps.restrictToPasses && !deps.restrictToPasses.includes(pass)) return false;
  if (state.completedPasses.includes(pass)) return false;
  if (state.skippedPasses.includes(pass)) return false;
  return true;
}

/**
 * Run one pass with retry/skip/stop semantics. On stop, throws ReviewPausedError
 * so the host can persist the partial state and offer a Resume affordance.
 * The `run` callback does the work and is responsible for mutating `state`;
 * it returns the number of findings for the passDone event.
 */
export async function executePassWithDecisions(
  deps: OrchestratorDeps,
  pass: PassName,
  label: string,
  increment: number,
  state: PartialReviewState,
  run: () => Promise<number>,
): Promise<void> {
  const { events, token, progress, log } = deps;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    report(progress, log, label, increment);
    checkCancel(token);
    events?.emit({ kind: 'passStart', pass, label, at: Date.now() });
    const passStart = Date.now();
    try {
      const findingCount = await run();
      state.completedPasses.push(pass);
      deps.onStateSnapshot?.(state);
      events?.emit({ kind: 'passDone', pass, findingCount, durationMs: Date.now() - passStart, at: Date.now() });
      return;
    } catch (e: any) {
      if (token?.isCancellationRequested) throw e;
      const errMsg = e?.message ?? String(e);
      log(`[${pass}] failed: ${errMsg}`);
      events?.emit({ kind: 'passError', pass, error: errMsg, at: Date.now() });

      const decide = deps.requestPassDecision;
      const decision: PassFailureDecision = decide ? await decide(pass, errMsg) : 'stop';
      events?.emit({ kind: 'passDecisionMade', pass, decision, at: Date.now() });

      if (decision === 'retry') {
        log(`[${pass}] retrying after user decision`);
        continue;
      }
      if (decision === 'skip') {
        state.skippedPasses.push(pass);
        deps.onStateSnapshot?.(state);
        log(`[${pass}] skipped after user decision`);
        return;
      }
      // stop
      state.pausedReason = `${pass}: ${errMsg}`;
      deps.onStateSnapshot?.(state);
      events?.emit({
        kind: 'paused',
        reason: state.pausedReason,
        completedPasses: [...state.completedPasses],
        skippedPasses: [...state.skippedPasses],
        findingCount: state.findings.length,
        at: Date.now(),
      });
      throw new ReviewPausedError(state);
    }
  }
}

/**
 * Adapter: runs one PlannedPass through the failure-decision loop and handles
 * the new-findings-into-state plumbing including Related: linking.
 */
export async function runPlannedPass(
  deps: OrchestratorDeps,
  step: PlannedPass,
  state: PartialReviewState,
): Promise<void> {
  if (!step.condition) return;
  if (!shouldRun(deps, step.pass, state)) return;

  if (step.conditionalSkip) {
    const reason = step.conditionalSkip(state);
    if (reason) {
      state.skippedPasses.push(step.pass);
      state.conditionalSkips = { ...(state.conditionalSkips ?? {}), [step.pass]: reason };
      deps.onStateSnapshot?.(state);
      deps.events?.emit({ kind: 'conditionalSkip', pass: step.pass, reason, at: Date.now() });
      deps.log(`[${step.pass}] skipped: ${reason}`);
      return;
    }
  }

  await executePassWithDecisions(deps, step.pass, step.label, step.increment, state, async () => {
    const findings = await step.run();
    // Link any "Related: ..." titles back to existing findings BEFORE appending.
    linkRelatedFindings(findings, state.findings);
    if (step.replaceAll && findings.length > 0) {
      state.findings.splice(0, state.findings.length, ...findings);
    } else {
      state.findings.push(...findings);
    }
    for (const f of findings) deps.events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
    return findings.length;
  });
}
