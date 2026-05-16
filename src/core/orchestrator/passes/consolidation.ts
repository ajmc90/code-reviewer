import { PartialReviewState } from '../../../types';
import { dedupeFindings } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';

/**
 * Phase C: local semantic dedupe. No CLI call. Emits a consolidation event so
 * the UI can explain the drop in finding count.
 */
export function runConsolidationPass(
  deps: OrchestratorDeps,
  state: PartialReviewState,
  silent = false,
): void {
  const before = state.findings.length;
  if (before === 0) return;
  const deduped = dedupeFindings(state.findings);
  const after = deduped.length;
  const merged = Math.max(0, before - after);
  state.findings.splice(0, state.findings.length, ...deduped);
  state.lastConsolidation = { before, after, merged };
  deps.onStateSnapshot?.(state);
  if (!silent) {
    deps.log(`Consolidation: ${before} → ${after} findings (${merged} merged).`);
    deps.events?.emit({ kind: 'consolidation', before, after, merged, at: Date.now() });
  }
}
