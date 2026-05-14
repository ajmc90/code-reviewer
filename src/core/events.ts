import * as vscode from 'vscode';

export type PassName = 'context' | 'diff' | 'structural' | 'explore' | 'security' | 'performance' | 'accessibility' | 'tests' | 'gaps' | 'permute' | 'critique' | 'summary';

/** User decision when a pass fails mid-review. */
export type PassFailureDecision = 'retry' | 'skip' | 'stop';

export type ReviewEvent =
  | { kind: 'start'; baseBranch: string; headBranch: string; at: number }
  | { kind: 'context'; languages: string[]; frameworks: string[]; testFrameworks: string[]; conventions: string[]; at: number }
  | { kind: 'diff'; filesChanged: number; additions: number; deletions: number; truncated: boolean; at: number }
  | { kind: 'passStart'; pass: PassName; label: string; at: number }
  | { kind: 'passOutput'; pass: PassName; chunk: string; at: number }
  | { kind: 'passDone'; pass: PassName; findingCount: number; durationMs: number; at: number }
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
  | { kind: 'findingAdded'; finding: any; at: number }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string; at: number }
  | { kind: 'done'; verdict: string; durationMs: number; findingCount: number; at: number }
  | { kind: 'cancelled'; at: number };

export class ReviewEventBus {
  private emitter = new vscode.EventEmitter<ReviewEvent>();
  readonly onEvent = this.emitter.event;
  private buffer: ReviewEvent[] = [];
  private readonly maxBuffer = 500;

  emit(e: ReviewEvent) {
    this.buffer.push(e);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
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
