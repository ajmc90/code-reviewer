import * as vscode from 'vscode';
import { GitService } from './git/gitService';
import { ClaudeCliClient } from './claude/cliClient';
import { FindingsTreeProvider, GroupMode } from './ui/findingsTree';
import { SummaryViewProvider, HistoryEntry } from './ui/summaryView';
import { FindingsDecorator } from './ui/decorations';
import { ReviewPanel, PartialReviewSummary } from './ui/reviewPanel';
import { ReviewStatusBar } from './ui/statusBar';
import { FixPreviewProvider } from './ui/fixPreview';
import { SilenceStore } from './core/silenceStore';
import { PassFailureDecision, PassName, ReviewEventBus } from './core/events';
import { PassConfig, ReviewResult } from './types';
import { Lang, getLang, onDidChangeLanguage, setLang, t } from './i18n';
import { CACHE_KEY, ExtensionRuntime } from './core/extensionContext';
import { loadCalibration, recordPassSample } from './core/calibration';
import { loadPartial, buildSummary } from './core/partialState';
import { loadHistory, loadHistoryResult, recordHistory } from './core/historyStore';
import { runReview } from './core/reviewController';
import { translateFindingOnDemand } from './claude/onDemandTranslator';
import { registerAllCommands } from './commands';

const GROUPBY_KEY = 'claudeReviewer.findingsGroupBy';

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Claude Review', { log: true });
  const log = (m: string) => output.appendLine(m);

  const tr = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) =>
    t(key, getLang(context), params);

  const findingsTree = new FindingsTreeProvider();
  const fixPreview = new FixPreviewProvider();
  const silenceStore = new SilenceStore(context.workspaceState);

  const savedGroupBy = context.workspaceState.get<GroupMode>(GROUPBY_KEY);
  if (savedGroupBy === 'severity' || savedGroupBy === 'file' || savedGroupBy === 'category') {
    findingsTree.setGroupBy(savedGroupBy);
  }
  void vscode.commands.executeCommand('setContext', 'claudeReviewer.findingsGroupBy', findingsTree.getGroupBy());

  const decorator = new FindingsDecorator();
  const bus = new ReviewEventBus();
  const statusBar = new ReviewStatusBar(bus, () => getLang(context));

  // Self-calibrating estimate: for each completed pass, persist its real
  // duration alongside the diff size seen at run time. The estimator on the
  // panel side reads this back via loadCalibration() and uses median
  // ms-per-line to predict future runs.
  let currentRunDiffSize = 0;
  context.subscriptions.push(
    bus.onEvent((e) => {
      if (e.kind === 'start') {
        currentRunDiffSize = 0;
        log(`[calibration] run start — diffSize reset`);
      } else if (e.kind === 'diff') {
        currentRunDiffSize = Math.max(0, (e.additions || 0) + (e.deletions || 0));
        log(`[calibration] diff event — diffSize=${currentRunDiffSize}`);
      } else if (e.kind === 'passDone') {
        log(`[calibration] passDone pass=${e.pass} dur=${e.durationMs}ms diffSize=${currentRunDiffSize} ${currentRunDiffSize > 0 ? '→ recording' : '→ SKIPPED (no diffSize)'}`);
        if (currentRunDiffSize > 0) {
          // Record THEN notify the panel — sequencing the post after the
          // memento write resolves means the next snapshot the panel reads
          // includes the just-finished sample. Without this ordering the
          // panel races the storage update and shows "no prior runs" forever.
          void recordPassSample(context, e.pass, e.durationMs, currentRunDiffSize).then(() => {
            ReviewPanel.currentInstance()?.refreshCalibration();
          });
        }
      }
    }),
  );

  const findingsTreeView = vscode.window.createTreeView('claudeReviewer.findings', {
    treeDataProvider: findingsTree,
    showCollapseAll: true,
  });
  findingsTree.onDidChangeGroupBy((mode) => {
    void context.workspaceState.update(GROUPBY_KEY, mode);
    void vscode.commands.executeCommand('setContext', 'claudeReviewer.findingsGroupBy', mode);
  });

  // Mutable state shared across modules via ExtensionRuntime.
  const runtimeState = {
    lastResult: context.workspaceState.get<ReviewResult>(CACHE_KEY) ?? null as ReviewResult | null,
    currentReviewCts: null as vscode.CancellationTokenSource | null,
  };
  const pendingDecisions = new Map<PassName, (d: PassFailureDecision) => void>();

  const cancelCurrentReview = () => {
    if (runtimeState.currentReviewCts) {
      log('Cancellation requested.');
      runtimeState.currentReviewCts.cancel();
    }
  };

  const getWorkspaceRoot = (): string | null => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage(tr('notif.openFolderFirst'));
      return null;
    }
    return folder.uri.fsPath;
  };

  const buildCli = (): ClaudeCliClient => {
    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    const cliPath = cfg.get<string>('claudeCliPath', 'claude');
    return new ClaudeCliClient(cliPath);
  };

  // summaryView depends on a callback that recall-history calls back into us —
  // we forward-declare via let so summaryDeps can reference recallReviewFromHistory.
  let summaryView!: SummaryViewProvider;

  const recallReviewFromHistory = async (id: string) => {
    const r = loadHistoryResult(context.workspaceState, id);
    if (!r) {
      vscode.window.showInformationMessage(tr('notif.historyResultMissing'));
      vscode.commands.executeCommand('claudeReviewer.showPanel');
      return;
    }
    runtimeState.lastResult = r;
    await context.workspaceState.update(CACHE_KEY, r);
    findingsTree.setResult(r);
    summaryView.setResult(r);
    decorator.setFindings(r.findings);
    ReviewPanel.currentInstance()?.setResult(r);
    refreshFindingsBadge();
    void vscode.commands.executeCommand('setContext', 'claudeReviewer.hasResult', true);
    vscode.commands.executeCommand('claudeReviewer.showPanel');
  };

  const summaryDeps = {
    getLang: () => getLang(context),
    getCurrentBranch: async (): Promise<string | null> => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return null;
      try {
        const g = new GitService(root);
        if (!(await g.isRepo())) return null;
        return await g.currentBranch();
      } catch {
        return null;
      }
    },
    getDefaultBaseBranch: async (): Promise<string | null> => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return null;
      try {
        const cfg = vscode.workspace.getConfiguration('claudeReviewer');
        const configured = cfg.get<string>('baseBranch', '');
        if (configured) return configured;
        const g = new GitService(root);
        if (!(await g.isRepo())) return null;
        return await g.detectDefaultBaseBranch();
      } catch {
        return null;
      }
    },
    getPartialSummary: (): PartialReviewSummary | null => buildSummary(loadPartial(context.workspaceState, log)),
    startReviewCurrentBranch: () => vscode.commands.executeCommand('claudeReviewer.reviewCurrentBranch'),
    startReviewInteractive: () => vscode.commands.executeCommand('claudeReviewer.reviewBranch'),
    openPanel: () => vscode.commands.executeCommand('claudeReviewer.showPanel'),
    cancelReview: () => cancelCurrentReview(),
    resumeReview: () => vscode.commands.executeCommand('claudeReviewer.resumeReview'),
    discardPartial: () => vscode.commands.executeCommand('claudeReviewer.discardPartial'),
    exportReport: () => vscode.commands.executeCommand('claudeReviewer.exportReport'),
    recallReview: (id: string) => recallReviewFromHistory(id),
    getHistory: (): HistoryEntry[] => loadHistory(context.workspaceState),
    isReviewRunning: () => runtimeState.currentReviewCts !== null,
  };
  summaryView = new SummaryViewProvider(summaryDeps, bus);

  const refreshFindingsBadge = () => {
    const n = findingsTree.attentionCount();
    findingsTreeView.badge = n > 0
      ? { value: n, tooltip: t('view.findings.badgeTooltip', getLang(context), { count: n }) }
      : undefined;
  };
  findingsTree.onDidChangeTreeData(refreshFindingsBadge);

  context.subscriptions.push(
    findingsTreeView,
    vscode.window.registerWebviewViewProvider(SummaryViewProvider.viewType, summaryView),
    summaryView,
    decorator,
    statusBar,
    bus,
    output,
    vscode.workspace.registerTextDocumentContentProvider(FixPreviewProvider.scheme, fixPreview),
  );

  if (runtimeState.lastResult) {
    findingsTree.setResult(runtimeState.lastResult);
    summaryView.setResult(runtimeState.lastResult);
    decorator.setFindings(runtimeState.lastResult.findings);
    refreshFindingsBadge();
  }
  void vscode.commands.executeCommand('setContext', 'claudeReviewer.hasResult', runtimeState.lastResult !== null);
  summaryView.setPartialSummary(buildSummary(loadPartial(context.workspaceState, log)));

  const broadcastPartialSummary = () => {
    const summary = buildSummary(loadPartial(context.workspaceState, log));
    ReviewPanel.currentInstance()?.setPartialSummary(summary);
    summaryView.setPartialSummary(summary);
  };

  const setResult = async (r: ReviewResult | null) => {
    if (r) {
      silenceStore.applyTo(r.findings);
    }
    runtimeState.lastResult = r;
    await context.workspaceState.update(CACHE_KEY, r);
    findingsTree.setResult(r);
    summaryView.setResult(r);
    decorator.setFindings(r?.findings ?? []);
    ReviewPanel.currentInstance()?.setResult(r);
    refreshFindingsBadge();
    void vscode.commands.executeCommand('setContext', 'claudeReviewer.hasResult', r !== null);
    if (r) {
      await recordHistory(context.workspaceState, r);
      summaryView.setResult(r);
    }
  };

  const rt: ExtensionRuntime = {
    ctx: context,
    output,
    log,
    tr,
    findingsTree,
    findingsTreeView,
    summaryView,
    decorator,
    fixPreview,
    bus,
    silenceStore,
    state: runtimeState,
    pendingDecisions,
    buildCli,
    getWorkspaceRoot,
    refreshFindingsBadge,
    setResult,
    broadcastPartialSummary,
    cancelCurrentReview,
  };

  const panelDeps = {
    getGit: (): GitService | null => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return root ? new GitService(root) : null;
    },
    startReview: async (base: string, head: string, passes?: Partial<PassConfig>) => {
      await runReview(rt, panelDeps, { baseBranch: base, headBranch: head, passes: passes as PassConfig | undefined });
    },
    cancelReview: () => cancelCurrentReview(),
    getPartialSummary: () => buildSummary(loadPartial(context.workspaceState, log)),
    submitPassDecision: (pass: PassName, decision: PassFailureDecision) => {
      const resolver = pendingDecisions.get(pass);
      if (resolver) {
        pendingDecisions.delete(pass);
        resolver(decision);
      }
    },
    resumeReview: () => vscode.commands.executeCommand('claudeReviewer.resumeReview'),
    retryPass: (pass: PassName) => vscode.commands.executeCommand('claudeReviewer.retryPass', pass),
    discardPartial: () => vscode.commands.executeCommand('claudeReviewer.discardPartial'),
    getLang: () => getLang(context),
    setLang: (lang: Lang) => setLang(context, lang),
    translateFinding: async (id: string, targetLang: Lang) => {
      await translateFindingOnDemand(rt, id, targetLang);
    },
    getCalibration: () => {
      const snap = loadCalibration(context);
      log(`[calibration] loadCalibration → ${JSON.stringify(snap)}`);
      return snap;
    },
  };

  context.subscriptions.push(...registerAllCommands(rt, panelDeps));

  context.subscriptions.push(
    onDidChangeLanguage((lang) => {
      statusBar.onLanguageChanged();
      summaryView.onLanguageChanged();
      refreshFindingsBadge();
      ReviewPanel.currentInstance()?.onLanguageChanged(lang);
    }),
  );
}

export function deactivate() {}
