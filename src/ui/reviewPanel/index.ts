import * as vscode from 'vscode';
import { PassConfig, ReviewResult } from '../../types';
import { PassFailureDecision, PassName, ReviewEventBus } from '../../core/events';
import { GitService } from '../../git/gitService';
import { Lang, t } from '../../i18n';
import { STYLES } from './styles';
import { renderBody } from './template';
import { buildClientScript } from './client';
import { sanitizePasses } from './sanitize';
import { collectBranchSnapshot, fetchAllWithSshUnlock } from './branchOps';

/**
 * Lightweight view of the persisted PartialReviewState. The webview needs to
 * know what was completed / skipped / pending, but doesn't need the full diff
 * or file contents the orchestrator keeps in workspaceState.
 */
export interface PartialReviewSummary {
  baseBranch: string;
  headBranch: string;
  completedPasses: string[];
  skippedPasses: string[];
  /**
   * The passes this paused review was planned to run (after user selection +
   * conditional gating). Lets the summary compute "X of Y pending" against the
   * actual plan instead of a hardcoded total.
   */
  plannedPasses?: string[];
  findingCount: number;
  pausedReason?: string;
  startedAt: number;
}

export interface ReviewPanelDeps {
  getGit: () => GitService | null;
  startReview: (base: string, head: string, passes?: Partial<PassConfig>) => Promise<void>;
  cancelReview: () => void;
  getPartialSummary: () => PartialReviewSummary | null;
  submitPassDecision: (pass: PassName, decision: PassFailureDecision) => void;
  resumeReview: () => void;
  retryPass: (pass: PassName) => void;
  discardPartial: () => void;
  getLang: () => Lang;
  setLang: (lang: Lang) => Promise<void>;
  translateFinding: (id: string, targetLang: Lang) => Promise<void>;
}

/**
 * Modern, interactive review panel.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │  HEADER · branch · verdict · risk · counters   │
 *   ├──────────────────────┬─────────────────────────┤
 *   │  LIVE TIMELINE       │  FINDINGS GRID          │
 *   │  (passes, log)       │  problem ↔ solution     │
 *   └──────────────────────┴─────────────────────────┘
 *
 * It receives live events from the orchestrator and a final result.
 */
export class ReviewPanel {
  private static current: ReviewPanel | undefined;

  static currentInstance(): ReviewPanel | undefined {
    return ReviewPanel.current;
  }

  static show(context: vscode.ExtensionContext, bus: ReviewEventBus, deps: ReviewPanelDeps): ReviewPanel {
    if (ReviewPanel.current) {
      ReviewPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return ReviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'claudeReviewer.review',
      t('panel.brand', deps.getLang()),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );
    const instance = new ReviewPanel(panel, bus, deps);
    ReviewPanel.current = instance;
    panel.onDidDispose(() => {
      if (ReviewPanel.current === instance) ReviewPanel.current = undefined;
    });
    return instance;
  }

  private result: ReviewResult | null = null;
  private busSub: vscode.Disposable;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly bus: ReviewEventBus,
    private readonly deps: ReviewPanelDeps,
  ) {
    panel.webview.html = this.html();
    this.busSub = bus.onEvent((e) => {
      this.post({ type: 'event', event: e });
    });
    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (e: any) {
        this.post({ type: 'branchError', message: e?.message ?? String(e) });
      }
    });
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg?.type === 'ready') {
      for (const e of this.bus.snapshot()) this.post({ type: 'event', event: e });
      if (this.result) this.post({ type: 'result', result: this.result });
      this.post({ type: 'partialSummary', summary: this.deps.getPartialSummary() });
      await this.refreshBranches();
    } else if (msg?.type === 'passDecision' && msg.pass && msg.decision) {
      this.deps.submitPassDecision(msg.pass as PassName, msg.decision as PassFailureDecision);
    } else if (msg?.type === 'resumeReview') {
      this.deps.resumeReview();
    } else if (msg?.type === 'retryPass' && msg.pass) {
      this.deps.retryPass(msg.pass as PassName);
    } else if (msg?.type === 'discardPartial') {
      this.deps.discardPartial();
    } else if (msg?.type === 'open' && msg.id) {
      vscode.commands.executeCommand('claudeReviewer.openFinding', msg.id);
    } else if (msg?.type === 'applyFix' && msg.id) {
      vscode.commands.executeCommand('claudeReviewer.applyFix', msg.id);
    } else if (msg?.type === 'dismiss' && msg.id) {
      vscode.commands.executeCommand('claudeReviewer.dismissFinding', msg.id);
    } else if (msg?.type === 'restore' && msg.id) {
      vscode.commands.executeCommand('claudeReviewer.restoreFinding', msg.id);
    } else if (msg?.type === 'askFollowUp' && msg.id) {
      vscode.commands.executeCommand('claudeReviewer.askFollowUp', msg.id);
    } else if (msg?.type === 'export') {
      vscode.commands.executeCommand('claudeReviewer.exportReport');
    } else if (msg?.type === 'refreshBranches') {
      await this.refreshBranches();
    } else if (msg?.type === 'fetchBranches') {
      await this.fetchBranches(!!msg.prune);
    } else if (msg?.type === 'startReview' && msg.base && msg.head) {
      const passes: Partial<PassConfig> | undefined = msg.passes && typeof msg.passes === 'object'
        ? sanitizePasses(msg.passes)
        : undefined;
      await this.deps.startReview(String(msg.base), String(msg.head), passes);
    } else if (msg?.type === 'cancelReview') {
      this.deps.cancelReview();
    } else if (msg?.type === 'aheadBehind' && msg.base && msg.head) {
      await this.computeAheadBehind(String(msg.base), String(msg.head), String(msg.reqId || ''));
    } else if (msg?.type === 'setLang' && (msg.lang === 'en' || msg.lang === 'es')) {
      await this.deps.setLang(msg.lang as Lang);
    } else if (msg?.type === 'translateFinding' && msg.id && (msg.lang === 'en' || msg.lang === 'es')) {
      await this.deps.translateFinding(String(msg.id), msg.lang as Lang);
    }
  }

  private async refreshBranches() {
    const snap = await collectBranchSnapshot(this.deps.getGit(), this.deps.getLang());
    this.post({ type: 'branches', ...snap });
  }

  private async fetchBranches(prune: boolean) {
    const git = this.deps.getGit();
    if (!git) return;
    this.post({ type: 'fetchStart' });
    try {
      const out = await fetchAllWithSshUnlock(git, prune, this.deps.getLang(), {
        onPrompt: (message) => this.post({ type: 'fetchPrompt', message }),
      });
      this.post({ type: 'fetchDone', output: out });
      await this.refreshBranches();
    } catch (e: any) {
      this.post({ type: 'fetchError', message: e?.message ?? String(e) });
    }
  }

  private async computeAheadBehind(base: string, head: string, reqId: string) {
    const git = this.deps.getGit();
    if (!git) return;
    const result = await git.aheadBehind(base, head);
    this.post({ type: 'aheadBehind', reqId, base, head, result });
  }

  setResult(result: ReviewResult | null) {
    this.result = result;
    this.post({ type: 'result', result });
  }

  setPartialSummary(summary: PartialReviewSummary | null) {
    this.post({ type: 'partialSummary', summary });
  }

  /** Re-render the entire panel HTML in the new language and replay state. */
  onLanguageChanged(lang: Lang) {
    this.panel.title = t('panel.brand', lang);
    this.panel.webview.html = this.html();
    if (this.result) this.post({ type: 'result', result: this.result });
    this.post({ type: 'partialSummary', summary: this.deps.getPartialSummary() });
    for (const e of this.bus.snapshot()) this.post({ type: 'event', event: e });
  }

  /** Apply translation result returned by the extension's on-demand translator. */
  postFindingTranslation(payload: { id: string; lang: Lang; fields: any }) {
    this.post({ type: 'findingTranslated', ...payload });
  }

  postFindingTranslationPending(id: string, targetLang: Lang) {
    this.post({ type: 'findingTranslationPending', id, targetLang });
  }

  postFindingTranslationError(id: string, targetLang: Lang, error: string) {
    this.post({ type: 'findingTranslationError', id, targetLang, error });
  }

  dispose() {
    this.busSub.dispose();
    this.panel.dispose();
  }

  private post(msg: any) {
    this.panel.webview.postMessage(msg);
  }

  private html(): string {
    const nonce = String(Math.random()).slice(2);
    const lang: Lang = this.deps.getLang();
    const tr = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) => t(key, lang, params);
    const escHtml = (s: string) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const trE = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) => escHtml(tr(key, params));

    return /* html */ `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${trE('panel.brand')}</title>
<style>${STYLES}</style>
</head>
${renderBody(lang, tr, trE)}
<script nonce="${nonce}">${buildClientScript(lang)}</script>
</body>
</html>`;
  }
}
