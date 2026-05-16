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
      if (state.kind === 'running') state.findingCount++;
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
