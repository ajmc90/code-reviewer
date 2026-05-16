import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { ClaudeCliClient } from '../../claude/cliClient';
import { PartialReviewState } from '../../types';
import { ReviewEventBus, PassFailureDecision, PassName } from '../events';

export interface OrchestratorDeps {
  git: GitService;
  cli: ClaudeCliClient;
  workspaceRoot: string;
  log: (msg: string) => void;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  token?: vscode.CancellationToken;
  model?: string;
  cliTimeoutMs?: number;
  ignoreGlobs: string[];
  contextFiles: string[];
  maxDiffBytes: number;
  events?: ReviewEventBus;
  /**
   * If provided, resume from this snapshot instead of collecting context/diff
   * and re-running passes that already completed or were skipped.
   */
  resumeFrom?: PartialReviewState | null;
  /**
   * Called when a pass fails with a CLI error. Returning 'retry' loops the
   * pass, 'skip' moves on to the next, 'stop' halts and surfaces partial state
   * via ReviewPausedError. If omitted, defaults to 'stop'.
   */
  requestPassDecision?: (pass: PassName, error: string) => Promise<PassFailureDecision>;
  /**
   * Invoked after each completed/skipped pass with the latest partial state,
   * so the host can persist it for resume.
   */
  onStateSnapshot?: (state: PartialReviewState) => void;
  /**
   * If set, only run these passes (others are not even attempted). Used for
   * the per-step Retry affordance after the review stopped.
   */
  restrictToPasses?: PassName[];
}
