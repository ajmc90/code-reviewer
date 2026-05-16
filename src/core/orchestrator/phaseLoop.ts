import { PartialReviewState } from '../../types';
import { OrchestratorDeps } from './types';
import { executePassWithDecisions, runPlannedPass, shouldRun } from './passRunner';
import { runStructuralPass } from './passes/structural';
import { runExplorePass } from './passes/explore';
import { runCritiquePass } from './passes/critique';
import { runConsolidationPass } from './passes/consolidation';
import { buildSpecialistPasses } from './passes/specialists';
import { buildCompletenessPasses } from './passes/completeness';

/**
 * Execute the five-phase pipeline (discovery → specialists → consolidation →
 * completeness → critique). The summary pass runs separately, after this
 * method returns, from `review()`.
 */
export async function runRemainingPasses(
  deps: OrchestratorDeps,
  state: PartialReviewState,
): Promise<void> {
  const { events } = deps;

  // ── PHASE A — DISCOVERY ─────────────────────────────────────────
  events?.emit({ kind: 'phaseStart', phase: 'discovery', at: Date.now() });

  if (state.opts.passes.structural && shouldRun(deps, 'structural', state)) {
    await executePassWithDecisions(deps, 'structural', 'Context scan', 8, state, async () => {
      return await runStructuralPass(deps, state);
    });
  }

  if (state.opts.passes.explore && shouldRun(deps, 'explore', state)) {
    await executePassWithDecisions(deps, 'explore', 'Exploration', 10, state, async () => {
      const { findings, changeMap } = await runExplorePass(deps, state);
      state.findings.push(...findings);
      if (changeMap.length > 0) {
        state.changeMap = changeMap;
        events?.emit({ kind: 'changeMap', entries: changeMap, at: Date.now() });
      }
      for (const f of findings) events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
      return findings.length;
    });
  }

  // ── PHASE B — SPECIALISTS ───────────────────────────────────────
  const specialists = buildSpecialistPasses(deps, state);
  const anySpecialistActive = specialists.some((s) => s.condition);
  if (anySpecialistActive) events?.emit({ kind: 'phaseStart', phase: 'specialists', at: Date.now() });
  for (const step of specialists) {
    await runPlannedPass(deps, step, state);
  }

  // ── PHASE C — CONSOLIDATION (local, no CLI) ─────────────────────
  if (state.findings.length > 0) {
    events?.emit({ kind: 'phaseStart', phase: 'consolidation', at: Date.now() });
    runConsolidationPass(deps, state);
  }

  // ── PHASE D — COMPLETENESS & ALTERNATIVES ───────────────────────
  const completeness = buildCompletenessPasses(deps, state);
  const anyCompletenessActive = completeness.some((s) => s.condition);
  if (anyCompletenessActive) events?.emit({ kind: 'phaseStart', phase: 'completeness', at: Date.now() });
  for (const step of completeness) {
    await runPlannedPass(deps, step, state);
  }

  // ── PHASE E — CRITIQUE (summary fires after this method returns) ─
  if (state.opts.passes.critique && shouldRun(deps, 'critique', state)) {
    events?.emit({ kind: 'phaseStart', phase: 'critique', at: Date.now() });
    await executePassWithDecisions(deps, 'critique', 'Self-critique', 8, state, async () => {
      const findings = await runCritiquePass(deps, state);
      if (findings.length > 0) {
        state.findings.splice(0, state.findings.length, ...findings);
      }
      for (const f of findings) events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
      return findings.length;
    });
    // One last consolidation after critique to clean residual duplicates.
    runConsolidationPass(deps, state, /*silent=*/ true);
  }
}
