import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { ClaudeCliClient } from '../../claude/cliClient';
import { PartialReviewState } from '../../types';
import { ReviewEventBus, PassFailureDecision, PassName } from '../events';
import { ReviewSessions } from './sessionManager';

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
  /**
   * Glob patterns of files whose CONTENT is excluded from the model context
   * (rawDiff hunks + loaded file context), but which still appear in the
   * changed-files list so the user knows the file was modified. Use for
   * deterministic auto-generated content that inflates the prompt without
   * informing the review: lockfiles, snapshots, generated locales.
   *
   * Distinct from `ignoreGlobs` which removes files from the review entirely.
   */
  contextExcludeGlobs: string[];
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
  /**
   * When true, the orchestrator emits an extra structured dump of every
   * surviving finding to the output channel at end of run, plus per-pass
   * finding summaries. Off by default — purely for A/B comparing prompt or
   * cost-saving changes against a baseline. Setting:
   * claudeReviewer.developerDiagnostics
   */
  developerDiagnostics?: boolean;
  /**
   * Session-reuse settings: when sessions is set, the CLI wrappers will
   * pass --session-id / --resume to the CLI so passes can share prompt cache.
   * Setting claudeReviewer.useSessionReuse (default true) controls whether
   * these are populated. When undefined, each pass spawns an isolated CLI
   * process (legacy behavior).
   */
  sessions?: ReviewSessions;
  /**
   * Optional sink for end-of-run metrics summary. Called once per completed
   * review with the aggregated per-pass cost + tokens that the estimator
   * uses to calibrate. Decoupled from the orchestrator via callback so the
   * orchestrator doesn't have to know about vscode storage.
   */
  onReviewMetrics?: (metrics: ReviewMetricsSummary) => void;

  /**
   * Runtime-only accumulator for the metrics summary. Set by the orchestrator
   * at the start of review() and read by every emitTelemetry call. Never
   * persisted; not part of the public deps contract for callers — they should
   * leave this undefined and let the orchestrator manage it.
   *
   * Typed as opaque to avoid a circular import from telemetry.ts; the
   * concrete type is ReviewMetricsAccumulator from telemetry.
   */
  metricsAccumulator?: unknown;
}

/**
 * Per-review aggregated metrics emitted at end-of-run. Mirrors what
 * sampleStore.ReviewSample needs (modulo the bits the controller adds:
 * timestamps, schemaVersion, depth, diff stats). Kept in this module to
 * avoid cross-coupling with the estimator package.
 */
export interface ReviewMetricsSummary {
  totalTokens: number;
  totalUsd: number;
  perPassUsd: Record<string, number>;
  perPassTokens: Record<string, number>;
  passesRun: string[];
  actualFindingsCount: number;
  enrichedDiffBytes: number;
  /**
   * Total wall-clock duration of the review (ms). Includes bootstrap +
   * all passes + summary, measured by the orchestrator. Persisted in
   * samples so the estimator can regress duration over real runs.
   */
  totalDurationMs: number;
}
