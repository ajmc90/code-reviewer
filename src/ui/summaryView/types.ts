import { Lang } from '../../i18n';
import { PartialReviewSummary } from '../reviewPanel';
import { PassName } from '../../core/events';

export interface SummaryDeps {
  getLang: () => Lang;
  getCurrentBranch: () => Promise<string | null>;
  getDefaultBaseBranch: () => Promise<string | null>;
  getPartialSummary: () => PartialReviewSummary | null;
  startReviewCurrentBranch: () => void;
  startReviewInteractive: () => void;
  openPanel: () => void;
  cancelReview: () => void;
  resumeReview: () => void;
  discardPartial: () => void;
  exportReport: () => void;
  recallReview: (id: string) => void;
  getHistory: () => HistoryEntry[];
  isReviewRunning: () => boolean;
}

export interface HistoryEntry {
  id: string;
  baseBranch: string;
  headBranch: string;
  verdict: string;
  findingCount: number;
  critical: number;
  major: number;
  finishedAt: number;
  durationMs: number;
}

export type RunState =
  | { kind: 'idle' }
  | {
      kind: 'running';
      currentPass: PassName | null;
      completedPasses: Set<PassName>;
      /**
       * The actual passes this run will execute, emitted on the 'start' event.
       * Drives progress fractions; falls back to a generous default if missing
       * so legacy events don't break the UI.
       */
      plannedPasses: PassName[];
      findingCount: number;
      startedAt: number;
      head: string;
      base: string;
    }
  | { kind: 'failed'; pass: PassName | null }
  | { kind: 'done'; verdict: string; findingCount: number }
  | { kind: 'cancelled' };

/**
 * Reasonable fallback when the orchestrator didn't supply plannedPasses (older
 * snapshots, e.g. a paused state saved before this field existed). Only used
 * for the paused-banner pending math, never for the running card.
 */
export const ALL_REAL_PASSES: PassName[] = [
  'structural',
  'explore',
  'security',
  'performance',
  'accessibility',
  'tests',
  'gaps',
  'permute',
  'critique',
];
