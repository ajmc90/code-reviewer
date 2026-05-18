import * as vscode from 'vscode';
import { PassName } from '../events';
import { ReasoningDepth } from '../../types';
import { COEFFICIENTS_SCHEMA_VERSION } from './coefficients';

/**
 * One real review's measurements, captured at end-of-run from the telemetry
 * stream. Used to calibrate the estimator beyond hardcoded coefficients —
 * after 5+ samples accumulate the estimator switches to regression.
 *
 * Per-pass tokens are stored so future improvements can fit per-pass curves
 * (e.g. critique scales differently from explore). Today the regression only
 * uses the totals; the per-pass detail is preserved for forward compatibility.
 */
export interface ReviewSample {
  at: number;                          // ms since epoch
  schemaVersion: number;               // matches COEFFICIENTS_SCHEMA_VERSION at capture time
  rawDiffBytes: number;
  enrichedDiffBytes: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  passes: PassName[];
  depth: ReasoningDepth;
  useSessionReuse: boolean;
  estimatedFindingsCount: number;      // what the heuristic predicted
  actualFindingsCount: number;         // what the review actually produced (visible)
  totalTokens: number;                 // sum across passes of (effective input + output)
  totalUsd: number;                    // sum across passes of costUsd
  /** Wall-clock duration of the entire review (ms). Used by the regression
   *  to predict future durations. May be 0 in old samples written before
   *  this field existed — regression filters those out. */
  totalDurationMs: number;
  perPassUsd: Partial<Record<PassName, number>>;
}

const STORAGE_KEY = 'claudeReviewer.estimator.samples';
const MAX_SAMPLES_PER_SCOPE = 20;

interface StoredProfile {
  samples: ReviewSample[];
}

/**
 * Sample store with two scopes:
 *   - workspaceState: narrow, fits this repo's specific patterns
 *   - globalState:    broad fallback across repos
 *
 * Estimator prefers workspace samples when at least 5 exist; otherwise falls
 * back to global, then to hardcoded coefficients. This mirrors what the old
 * (now-deleted) calibration store did for duration, but for token cost.
 */
export class SampleStore {
  constructor(private ctx: vscode.ExtensionContext) {}

  recordSample(sample: ReviewSample): Promise<void> {
    return Promise.all([
      this.appendTo(this.ctx.workspaceState, sample),
      this.appendTo(this.ctx.globalState, sample),
    ]).then(() => undefined);
  }

  /**
   * Get the samples we'd use for calibration: workspace first if it has
   * enough, otherwise global. Returns empty array if neither has enough.
   */
  getCalibratedSamples(minWorkspace = 5): { samples: ReviewSample[]; scope: 'workspace' | 'global' | 'none' } {
    const ws = this.read(this.ctx.workspaceState);
    if (ws.samples.length >= minWorkspace) return { samples: ws.samples, scope: 'workspace' };
    const gl = this.read(this.ctx.globalState);
    if (gl.samples.length > 0) return { samples: gl.samples, scope: 'global' };
    return { samples: [], scope: 'none' };
  }

  /**
   * Surface counts for the UI (and the debug command). Doesn't return the
   * samples themselves to avoid leaking large payloads when the caller only
   * needs to know "do we have enough yet."
   */
  getSampleCounts(): { workspace: number; global: number } {
    return {
      workspace: this.read(this.ctx.workspaceState).samples.length,
      global: this.read(this.ctx.globalState).samples.length,
    };
  }

  /** Test/debug aid: wipe samples in both scopes. */
  async reset(): Promise<void> {
    await this.ctx.workspaceState.update(STORAGE_KEY, undefined);
    await this.ctx.globalState.update(STORAGE_KEY, undefined);
  }

  private read(memento: vscode.Memento): StoredProfile {
    const raw = memento.get<StoredProfile>(STORAGE_KEY);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.samples)) return { samples: [] };
    // Drop samples from older coefficient schemas — they encode different
    // assumptions and would skew the regression.
    const fresh = raw.samples.filter((s) => s.schemaVersion === COEFFICIENTS_SCHEMA_VERSION);
    return { samples: fresh };
  }

  private async appendTo(memento: vscode.Memento, sample: ReviewSample): Promise<void> {
    const profile = this.read(memento);
    const next = [...profile.samples, sample];
    while (next.length > MAX_SAMPLES_PER_SCOPE) next.shift();
    await memento.update(STORAGE_KEY, { samples: next });
  }
}
