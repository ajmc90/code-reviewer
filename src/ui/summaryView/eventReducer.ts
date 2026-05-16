import { ReviewEvent } from '../../core/events';
import { RunState } from './types';

export interface ReduceResult {
  state: RunState;
  /** Whether the reducer wants the tick timer running after this event. */
  shouldTick: boolean;
}

/**
 * Pure reducer that maps a ReviewEvent onto a new RunState. Returning
 * `shouldTick` lets the caller decide whether to keep the 1-Hz refresh timer
 * alive (only useful while a run is in flight).
 *
 * Note on findingCount: the count reflects what's currently VISIBLE in the
 * panel grid, not the historical total. It increments on additive findings,
 * RESETS when a pass emits replaceAll (critique), and DECREMENTS when
 * consolidation reports a merge. This matches what the user sees and keeps
 * the sidebar honest if critique drops half the list.
 */
export function reduceEvent(state: RunState, e: ReviewEvent): ReduceResult {
  switch (e.kind) {
    case 'start':
      return {
        state: {
          kind: 'running',
          currentPass: null,
          completedPasses: new Set(),
          plannedPasses: e.plannedPasses ?? [],
          findingCount: 0,
          startedAt: e.at,
          head: e.headBranch,
          base: e.baseBranch,
        },
        shouldTick: true,
      };
    case 'context':
      if (state.kind === 'running') state.completedPasses.add('context' as any);
      return { state, shouldTick: state.kind === 'running' };
    case 'diff':
      if (state.kind === 'running') state.completedPasses.add('diff' as any);
      return { state, shouldTick: state.kind === 'running' };
    case 'passStart':
      if (state.kind === 'running') state.currentPass = e.pass;
      return { state, shouldTick: state.kind === 'running' };
    case 'passDone':
      if (state.kind === 'running') {
        state.completedPasses.add(e.pass);
        if (state.currentPass === e.pass) state.currentPass = null;
      }
      return { state, shouldTick: state.kind === 'running' };
    case 'passError':
      if (state.kind === 'running') {
        return { state: { kind: 'failed', pass: e.pass }, shouldTick: false };
      }
      return { state, shouldTick: false };
    case 'findingAdded':
      if (state.kind === 'running') {
        if (e.replaceAll) {
          // Critique (or any future replaceAll pass) starts a fresh visible
          // set. The first replaceAll event of a burst resets the counter;
          // subsequent ones in the same burst increment it. We detect "first"
          // by checking the most recent event mode — track it on the state
          // object so we don't need a side channel.
          if (!state._replaceMode) {
            state.findingCount = 0;
            state._replaceMode = true;
          }
          // Drop/merge findings ARE emitted (audit trail) but shouldn't count
          // toward the visible total. The orchestrator tags them via
          // finding.decision; sidebar reads that to filter.
          const dec = (e.finding && e.finding.decision) as string | undefined;
          if (dec !== 'drop' && dec !== 'merge') state.findingCount++;
        } else {
          state._replaceMode = false;
          state.findingCount++;
        }
      }
      return { state, shouldTick: state.kind === 'running' };
    case 'consolidation':
      if (state.kind === 'running' && e.merged > 0) {
        state.findingCount = Math.max(0, state.findingCount - e.merged);
      }
      return { state, shouldTick: state.kind === 'running' };
    case 'critiqueDecisions':
      if (state.kind === 'running') {
        state.critique = {
          kept: e.kept,
          revised: e.revised,
          dropped: e.dropped,
          merged: e.merged,
          newFindings: e.newFindings,
        };
      }
      return { state, shouldTick: state.kind === 'running' };
    case 'done':
      return {
        state: { kind: 'done', verdict: e.verdict, findingCount: e.findingCount },
        shouldTick: false,
      };
    case 'cancelled':
      return { state: { kind: 'cancelled' }, shouldTick: false };
    case 'paused':
      // The partial summary is pushed separately via setPartialSummary; the
      // reducer just stops ticking.
      return { state, shouldTick: false };
    default:
      return { state, shouldTick: state.kind === 'running' };
  }
}
