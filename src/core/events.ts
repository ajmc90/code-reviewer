import * as vscode from 'vscode';

export type PassName = 'context' | 'diff' | 'structural' | 'explore' | 'security' | 'performance' | 'accessibility' | 'tests' | 'gaps' | 'permute' | 'critique' | 'summary';

export type ReviewEvent =
  | { kind: 'start'; baseBranch: string; headBranch: string; at: number }
  | { kind: 'context'; languages: string[]; frameworks: string[]; testFrameworks: string[]; conventions: string[]; at: number }
  | { kind: 'diff'; filesChanged: number; additions: number; deletions: number; truncated: boolean; at: number }
  | { kind: 'passStart'; pass: PassName; label: string; at: number }
  | { kind: 'passOutput'; pass: PassName; chunk: string; at: number }
  | { kind: 'passDone'; pass: PassName; findingCount: number; durationMs: number; at: number }
  | { kind: 'passError'; pass: PassName; error: string; at: number }
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
