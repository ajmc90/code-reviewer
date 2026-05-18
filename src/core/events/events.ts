import * as vscode from 'vscode';
import { ChangeMapEntry, ReviewPhase } from '../../types';
import { CliUsage, CliToolInvocation } from '../../claude/cliClient';

export type PassName = 'context' | 'diff' | 'structural' | 'explore' | 'security' | 'performance' | 'accessibility' | 'tests' | 'gaps' | 'permute' | 'critique' | 'summary' | 'consolidation';

/** User decision when a pass fails mid-review. */
export type PassFailureDecision = 'retry' | 'skip' | 'stop';

export type ReviewEvent =
  | {
      kind: 'start';
      baseBranch: string;
      headBranch: string;
      /**
       * The actual pass keys this run will execute (after applying user
       * selection and depth-gating). Lets the UI compute accurate progress
       * fractions like "2/4 passes" instead of "2/12 passes" against a
       * hardcoded total.
       */
      plannedPasses: PassName[];
      at: number;
    }
  | { kind: 'context'; languages: string[]; frameworks: string[]; testFrameworks: string[]; conventions: string[]; at: number }
  | { kind: 'diff'; filesChanged: number; additions: number; deletions: number; truncated: boolean; at: number }
  | { kind: 'passStart'; pass: PassName; label: string; at: number }
  | { kind: 'passOutput'; pass: PassName; chunk: string; at: number }
  | {
      kind: 'passDone';
      pass: PassName;
      findingCount: number;
      durationMs: number;
      // Optional telemetry from the CLI call. Missing for resume-rehydrated
      // passDone events (older snapshots predate this field) and for any pass
      // that didn't make a CLI call.
      usage?: CliUsage;
      toolsInvoked?: CliToolInvocation[];
      apiRetries?: number;
      at: number;
    }
  | { kind: 'passError'; pass: PassName; error: string; at: number }
  // Pass failed and we're waiting for the user to choose retry/skip/stop. The
  // orchestrator is parked until a decision arrives via the panel message bus.
  | { kind: 'passAwaitDecision'; pass: PassName; error: string; at: number }
  // Decision received — UI uses this to clear the inline prompt.
  | { kind: 'passDecisionMade'; pass: PassName; decision: PassFailureDecision; at: number }
  // Review halted with resumable state saved. UI uses this to show the Resume banner.
  | { kind: 'paused'; reason: string; completedPasses: string[]; skippedPasses: string[]; findingCount: number; at: number }
  // Single-pass retry (from the per-step "Retry" affordance after the review stopped).
  | { kind: 'retryPassStart'; pass: PassName; at: number }
  // replaceAll === true means this pass produced the FULL revised finding set
  // (vs. additive findings). The panel uses this to know whether to append the
  // pass's buffer to state.findings or replace state.findings entirely. Today
  // only the critique pass sets this, but it's exposed so future passes can
  // opt in without the panel needing to know their name.
  | { kind: 'findingAdded'; finding: any; replaceAll?: boolean; at: number }
  // The explore pass produced a per-file changeMap. UI uses it to render the
  // "Changes in this branch" section above the findings grid.
  | { kind: 'changeMap'; entries: ChangeMapEntry[]; at: number }
  // The local consolidation phase ran. before/after counts let the UI explain
  // why the finding total dropped after specialists.
  | { kind: 'consolidation'; before: number; after: number; merged: number; at: number }
  // The critique pass applied KEEP/REVISE/DROP/MERGE decisions to the prior
  // finding set. UI uses {kept, revised, dropped, merged} to show a delta
  // like "8 findings (−6 dropped · −4 merged · 2 revised)" in the sidebar and
  // a "Revised" filter chip in the panel that surfaces decision detail.
  | {
      kind: 'critiqueDecisions';
      kept: number;
      revised: number;
      dropped: number;
      merged: number;
      newFindings: number;
      at: number;
    }
  // A pass was skipped because a runtime condition was not met (e.g. permute
  // skipped because no critical findings exist). UI surfaces the reason as a
  // tooltip on the pass pill.
  | { kind: 'conditionalSkip'; pass: PassName; reason: string; at: number }
  // Phase marker — purely for UI to render section headers in the timeline.
  | { kind: 'phaseStart'; phase: ReviewPhase; at: number }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string; at: number }
  | { kind: 'done'; verdict: string; durationMs: number; findingCount: number; at: number }
  | { kind: 'cancelled'; at: number };

export class ReviewEventBus {
  private emitter = new vscode.EventEmitter<ReviewEvent>();
  readonly onEvent = this.emitter.event;
  private buffer: ReviewEvent[] = [];
  // Cap is generous because passOutput (the high-volume streaming event) is
  // excluded from the buffer — structural events for a full review fit well
  // under this even with hundreds of findings.
  private readonly maxBuffer = 2000;

  emit(e: ReviewEvent) {
    // passOutput is streamed live but intentionally not buffered: it's emitted
    // many times per pass and would evict the passStart/passDone/findingAdded
    // events the panel needs to rebuild its timeline after a tab reopen.
    if (e.kind !== 'passOutput') {
      this.buffer.push(e);
      if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    }
    this.emitter.fire(e);
  }

  snapshot(): ReviewEvent[] {
    return [...this.buffer];
  }

  reset() {
    this.buffer = [];
  }

  dispose() {
    this.emitter.dispose();
  }
}
