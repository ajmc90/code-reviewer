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

export interface CritiqueDelta {
  kept: number;
  revised: number;
  dropped: number;
  merged: number;
  newFindings: number;
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
      /**
       * Count of findings currently visible (not dismissed, not dropped/merged
       * by critique). Maintained by reduceEvent: incremented on findingAdded,
       * reset by replaceAll, decremented when consolidation merges duplicates.
       * This is the number that should appear in the sidebar — NOT a
       * monotonically growing emission count.
       */
      findingCount: number;
      /**
       * Set after critique fires its decisions event. Lets the render show a
       * "−6 dropped · −4 merged · 2 revised" delta below the findings count
       * so the user can explain the post-critique drop.
       */
      critique?: CritiqueDelta;
      /**
       * Internal flag for reduceEvent: set to true on the FIRST findingAdded
       * event with replaceAll, so subsequent events in the same burst can
       * tell they're part of an ongoing replace (and should increment, not
       * reset). Reset to false the next time we see a non-replaceAll event.
       */
      _replaceMode?: boolean;
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
