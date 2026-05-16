import { PartialReviewState } from '../../../types';
import { dedupeFindings } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';

/**
 * Phase C: local semantic dedupe. No CLI call. Emits a consolidation event so
 * the UI can explain the drop in finding count.
 *
 * Modes:
 *   default       — always emits a consolidation event + logs (the visible
 *                   "Consolidation · NO DUPLICATES / −N merged" step).
 *   silent: true  — runs the dedupe, never emits or logs. Used for the
 *                   post-critique pass where the event would be redundant
 *                   with critique's own emission.
 *   onlyIfMerged: true — runs the dedupe; emits + logs ONLY if something
 *                   actually merged. Used between additive passes so we
 *                   don't spam the timeline with "0 merged" pills after
 *                   every specialist.
 */
export function runConsolidationPass(
  deps: OrchestratorDeps,
  state: PartialReviewState,
  silent = false,
  onlyIfMerged = false,
): void {
  // Critique-dropped + critique-merged findings live in state.findings as the
  // audit trail behind the "Revised" chip. They must NEVER be re-deduped (the
  // user would lose the explanation) and they must NEVER be presented as live
  // duplicates. Partition first, dedupe only the live set.
  const live: typeof state.findings = [];
  const archived: typeof state.findings = [];
  for (const f of state.findings) {
    if (f.decision === 'drop' || f.decision === 'merge') archived.push(f);
    else live.push(f);
  }
  const before = live.length;
  if (before === 0) return;
  const deduped = dedupeFindings(live);
  const after = deduped.length;
  const merged = Math.max(0, before - after);
  state.findings.splice(0, state.findings.length, ...deduped, ...archived);
  state.lastConsolidation = { before, after, merged };
  deps.onStateSnapshot?.(state);
  if (silent) return;
  if (onlyIfMerged && merged === 0) return;
  deps.log(`Consolidation: ${before} → ${after} findings (${merged} merged).`);
  deps.events?.emit({ kind: 'consolidation', before, after, merged, at: Date.now() });
}
