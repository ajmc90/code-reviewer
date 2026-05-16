import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { ClaudeCliClient } from '../../claude/cliClient';
import { ReviewEventBus, PassName, PassFailureDecision } from './events';
import { ReviewResult } from '../../types';
import { FindingsTreeProvider } from '../../ui/findingsTree';
import { SummaryViewProvider } from '../../ui/summaryView';
import { FindingsDecorator } from '../../ui/decorations';
import { FixPreviewProvider } from '../../ui/fixPreview';
import { SilenceStore } from '../stores/silenceStore';
import { getLang, t } from '../../i18n';

export const CACHE_KEY = 'claudeReviewer.lastResult';

/**
 * Mutable state and dependencies shared across the extension's modules.
 * Built once in activate(), then passed to controllers/commands so they don't
 * each need to capture their own closure of context + state.
 */
export interface ExtensionRuntime {
  ctx: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  log: (m: string) => void;
  tr: (key: Parameters<typeof t>[0], params?: Record<string, string | number>) => string;

  findingsTree: FindingsTreeProvider;
  findingsTreeView: vscode.TreeView<unknown>;
  summaryView: SummaryViewProvider;
  decorator: FindingsDecorator;
  fixPreview: FixPreviewProvider;
  bus: ReviewEventBus;
  silenceStore: SilenceStore;

  /** Mutable: most recent fully-loaded ReviewResult (or null). */
  state: {
    lastResult: ReviewResult | null;
    currentReviewCts: vscode.CancellationTokenSource | null;
  };

  /**
   * Pending pass-failure decisions: orchestrator awaits a Promise stored here
   * keyed by pass name; the panel resolves it via a 'passDecision' message.
   */
  pendingDecisions: Map<PassName, (d: PassFailureDecision) => void>;

  /** Build a CLI client using the current config. */
  buildCli: () => ClaudeCliClient;

  /** Workspace root + folder check; shows an error notification on failure. */
  getWorkspaceRoot: () => string | null;

  /** Refresh the badge on the findings tree view. */
  refreshFindingsBadge: () => void;

  /** Push the latest result through every consumer (tree, summary, decorator, panel). */
  setResult: (r: ReviewResult | null) => Promise<void>;

  /** Push the latest partial-state summary through every consumer. */
  broadcastPartialSummary: () => void;

  /** Cancel the active review, if any. */
  cancelCurrentReview: () => void;
}

export function createGit(root: string): GitService {
  return new GitService(root);
}

export { getLang };
