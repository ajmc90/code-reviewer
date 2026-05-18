import { PartialReviewState } from '../../types';
import { OrchestratorDeps } from './types';
import { executePassWithDecisions, runPlannedPass, shouldRun } from './passRunner';
import { runStructuralPass } from './passes/structural';
import { runExplorePass } from './passes/explore';
import { runCritiquePass } from './passes/critique';
import { runConsolidationPass } from './passes/consolidation';
import { buildSpecialistPasses } from './passes/specialists';
import { buildCompletenessPasses } from './passes/completeness';
import { dedupeFindings } from '../../claude/parser';

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
      const { findings: rawFindings, changeMap, metrics } = await runExplorePass(deps, state);
      // Same intra-pass dedupe as runPlannedPass — catches the case where the
      // LLM repeats the same finding twice in one response.
      const findings = dedupeFindings(rawFindings);
      if (findings.length < rawFindings.length) {
        deps.log(`[explore] intra-pass dedupe: ${rawFindings.length} → ${findings.length}`);
      }
      state.findings.push(...findings);
      if (changeMap.length > 0) {
        state.changeMap = changeMap;
        events?.emit({ kind: 'changeMap', entries: changeMap, at: Date.now() });
      }
      for (const f of findings) events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
      return { findingCount: findings.length, metrics };
    });
  }

  // ── PHASE B — SPECIALISTS ───────────────────────────────────────
  // After each specialist (and every other additive pass below), we run an
  // *incremental* consolidation: dedupe state.findings against itself, but
  // only emit a visible Consolidation step + UI sync when it actually merged
  // something. This avoids the failure mode the user reported — two specialist
  // passes both flagging the same SQL injection, leaving duplicate cards in
  // the grid until critique finally collapsed them ~minutes later.
  const specialists = buildSpecialistPasses(deps, state);
  const anySpecialistActive = specialists.some((s) => s.condition);
  if (anySpecialistActive) events?.emit({ kind: 'phaseStart', phase: 'specialists', at: Date.now() });
  for (const step of specialists) {
    await runPlannedPass(deps, step, state);
    runConsolidationPass(deps, state, /*silent=*/ false, /*onlyIfMerged=*/ true);
  }

  // ── PHASE C — CONSOLIDATION (local, no CLI) ─────────────────────
  // Always show a Consolidation step at the canonical Phase C boundary,
  // even if everything already converged via the incremental passes above
  // (then it renders as "no duplicates", informational, not noisy).
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
    // Same per-pass incremental dedupe: gaps and permute are notorious for
    // re-stating problems specialists already raised.
    runConsolidationPass(deps, state, /*silent=*/ false, /*onlyIfMerged=*/ true);
  }

  // ── PHASE E — CRITIQUE (summary fires after this method returns) ─
  if (state.opts.passes.critique && shouldRun(deps, 'critique', state)) {
    events?.emit({ kind: 'phaseStart', phase: 'critique', at: Date.now() });
    await executePassWithDecisions(deps, 'critique', 'Self-critique', 8, state, async () => {
      const { findings: all, counts, metrics } = await runCritiquePass(deps, state);
      // Critique returns the FULL set: kept + revised + new (visible) +
      // dropped + merged (hidden by default, surfaced in the "Revised" chip).
      // Dedupe only across the VISIBLE subset — running dedupe on dropped
      // findings would discard the audit trail we just paid an LLM call for.
      const visible = all.filter(isVisibleAfterCritique);
      const hidden = all.filter((f) => !isVisibleAfterCritique(f));
      const dedupedVisible = dedupeFindings(visible);
      if (dedupedVisible.length < visible.length) {
        deps.log(`[critique] intra-pass dedupe on visible: ${visible.length} → ${dedupedVisible.length}`);
      }
      const finalFindings = [...dedupedVisible, ...hidden];
      state.findings.splice(0, state.findings.length, ...finalFindings);

      // replaceAll: critique returns the FULL revised finding set so the
      // panel must replace its mirror of state.findings instead of appending.
      // Emit every finding (including dropped/merged) — the panel uses the
      // decision field to filter/display, not the presence of the event.
      for (const f of finalFindings) {
        events?.emit({ kind: 'findingAdded', finding: f, replaceAll: true, at: Date.now() });
      }
      // Emit the decision summary so the sidebar can show the delta and the
      // panel can light up its "Revised" chip with the right counts.
      events?.emit({
        kind: 'critiqueDecisions',
        kept: counts.kept,
        revised: counts.revised,
        dropped: counts.dropped,
        merged: counts.merged,
        newFindings: counts.newFindings,
        at: Date.now(),
      });
      // The passDone findingCount should reflect the VISIBLE set — what the
      // user will actually see in the grid — not the audit-trail total.
      return { findingCount: dedupedVisible.length, metrics };
    });
    // One last consolidation after critique to clean residual duplicates in
    // the visible subset. Skip dropped/merged entries — they live in
    // state.findings for the audit trail but should never collapse together.
    runConsolidationPass(deps, state, /*silent=*/ true);
  }
}

/**
 * A finding survives critique's filtering if it has no decision (legacy/keep
 * from earlier passes) or was explicitly kept/revised. Dropped + merged
 * findings stay in state.findings for the audit trail but are filtered out of
 * the visible grid by the panel.
 */
function isVisibleAfterCritique(f: { decision?: string }): boolean {
  return !f.decision || f.decision === 'keep' || f.decision === 'revise';
}
