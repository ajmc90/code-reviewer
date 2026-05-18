import * as vscode from 'vscode';
import { PassConfig, ReviewResult, ReasoningDepth } from '../../types';
import { PassFailureDecision, PassName, ReviewEventBus } from '../../core/events';
import { GitService } from '../../git/gitService';
import { Lang, t } from '../../i18n';
import { STYLES } from './styles';
import { renderBody } from './template';
import { buildClientScript } from './client';
import { sanitizePasses } from './sanitize';
import { collectBranchSnapshot, fetchAllWithSshUnlock } from './branchOps';
import { estimateReviewCost, buildEstimatorInput } from '../../core/estimator';
import { SampleStore } from '../../core/estimator/sampleStore';
import { fitRegression } from '../../core/estimator/regression';

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
    const instance = new ReviewPanel(panel, bus, deps, context);
    ReviewPanel.current = instance;
    panel.onDidDispose(() => {
      if (ReviewPanel.current === instance) ReviewPanel.current = undefined;
    });
    return instance;
  }

  private result: ReviewResult | null = null;
  private busSub: vscode.Disposable;
  /**
   * Cache rawDiffBytes by `base|head` so that re-estimating when the user
   * toggles a pass or changes depth doesn't re-run `git diff` (which can be
   * slow on large branches). Invalidated when base/head changes, which the
   * cache key naturally handles, and when the panel is disposed.
   */
  private diffSizeCache = new Map<string, number>();

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly bus: ReviewEventBus,
    private readonly deps: ReviewPanelDeps,
    private readonly extensionContext: vscode.ExtensionContext,
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
      this.postCurrentSettings();
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
    } else if (msg?.type === 'openPath' && msg.path) {
      vscode.commands.executeCommand('claudeReviewer.openPath', String(msg.path));
    } else if (msg?.type === 'clipboardFallback' && typeof msg.text === 'string') {
      try {
        await vscode.env.clipboard.writeText(msg.text);
      } catch {
        // Best effort — webview already showed "Copied" feedback.
      }
    } else if (msg?.type === 'applyFix') {
      // The panel sends the full finding object when available so the apply
      // command works during streaming (lastResult is only written when the
      // review finishes). Fall back to id-lookup for older payloads / other
      // call paths that still send just an id.
      const payload = msg.finding ?? msg.id;
      if (payload) vscode.commands.executeCommand('claudeReviewer.applyFix', payload);
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
    } else if (msg?.type === 'requestEstimate' && msg.base && msg.head) {
      await this.computeEstimate(
        String(msg.base),
        String(msg.head),
        msg.passes && typeof msg.passes === 'object' ? sanitizePasses(msg.passes) : undefined,
        typeof msg.depth === 'string' ? (msg.depth as any) : 'deep',
        typeof msg.useSessionReuse === 'boolean' ? msg.useSessionReuse : true,
        String(msg.reqId || ''),
      );
    } else if (msg?.type === 'updateSetting' && typeof msg.key === 'string') {
      await this.updateSetting(String(msg.key), msg.value);
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

  /**
   * Estimate the cost of reviewing base...head with the given config WITHOUT
   * executing anything. Called by the panel client whenever the user changes
   * branches, passes, depth, or session-reuse so the cost chip stays in sync.
   *
   * Uses a per-(base, head) cache for rawDiffBytes since the diff size only
   * changes when the branch pair changes — toggling a pass or depth re-runs
   * the cheap math (~1ms) instead of re-running `git diff` (~50-500ms).
   */
  private async computeEstimate(
    base: string,
    head: string,
    passesOverride: Partial<PassConfig> | undefined,
    depth: ReasoningDepth,
    useSessionReuse: boolean,
    reqId: string,
  ) {
    const git = this.deps.getGit();
    if (!git) return;
    const key = `${base}|${head}`;
    let rawDiffBytes: number;
    let stat;
    try {
      // Always need stat for the estimator's lines-changed heuristic; cache
      // only the rawDiff fetch since that's the expensive part.
      stat = await git.diffStat(base, head);
      const cached = this.diffSizeCache.get(key);
      if (cached !== undefined) {
        rawDiffBytes = cached;
      } else {
        const rawDiff = await git.rawDiff(base, head);
        rawDiffBytes = Buffer.byteLength(rawDiff, 'utf8');
        this.diffSizeCache.set(key, rawDiffBytes);
      }
    } catch (e: any) {
      // Branch pair invalid or git failed — surface as a no-estimate response
      // so the client clears its chip rather than showing stale data.
      this.post({ type: 'estimate', reqId, base, head, error: e?.message ?? String(e) });
      return;
    }
    if (stat.filesChanged === 0) {
      this.post({ type: 'estimate', reqId, base, head, empty: true });
      return;
    }
    // Translate the panel's PassConfig (object of booleans) into the ordered
    // PassName[] the orchestrator would execute. Mirrors the gating in
    // computePlannedPasses, but without state.changedFiles (we don't have it
    // pre-bootstrap), so accessibility is included optimistically — the
    // estimator's overhead for skipping it later is negligible vs the cost of
    // running git diff again to detect UI files.
    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    const defaultPasses = cfg.get<Record<string, boolean>>('passes', {});
    const enabled = (k: keyof PassConfig): boolean => {
      if (passesOverride && k in passesOverride) return !!passesOverride[k];
      return defaultPasses[k] !== false;
    };
    const passes: PassName[] = [];
    if (enabled('structural')) passes.push('structural');
    if (enabled('explore')) passes.push('explore');
    if (enabled('security')) passes.push('security');
    if (enabled('performance')) passes.push('performance');
    if (enabled('accessibility')) passes.push('accessibility');
    if (enabled('tests')) passes.push('tests');
    if (enabled('gaps')) passes.push('gaps');
    if (enabled('permute') && (depth === 'deep' || depth === 'obsessive')) passes.push('permute');
    if (enabled('critique')) passes.push('critique');
    passes.push('summary');

    const input = buildEstimatorInput({
      rawDiffBytes,
      linesAdded: stat.insertions,
      linesRemoved: stat.deletions,
      filesChanged: stat.filesChanged,
      passes,
      depth,
      useSessionReuse,
    });

    // Fit a regression correction from real samples accumulated in this
    // workspace. The dense-diff under-estimation problem can't be fixed by
    // tuning the hardcoded coefficients without breaking other anchors —
    // see project_calibration_baseline. The right fix is letting each
    // workspace learn its own correction factor from its own runs.
    const sampleStore = new SampleStore(this.extensionContext);
    const { samples } = sampleStore.getCalibratedSamples(1);
    let calibration: { durationFactor: number; costFactor: number; sampleCount: number } | undefined;
    if (samples.length > 0) {
      const rows = samples.map((s) => {
        const predicted = estimateReviewCost({
          rawDiffBytes: s.rawDiffBytes,
          enrichedDiffBytes: s.enrichedDiffBytes,
          passes: s.passes,
          depth: s.depth,
          useSessionReuse: s.useSessionReuse,
          estimatedFindings: Math.max(3, s.actualFindingsCount),
        });
        return {
          sample: s,
          predictedDurationMs: predicted.estimatedDurationSec * 1000,
          predictedUsd: predicted.centralUsd,
        };
      });
      const fit = fitRegression(rows);
      calibration = {
        durationFactor: fit.durationFactor,
        costFactor: fit.costFactor,
        sampleCount: fit.sampleCount,
      };
    }

    const est = estimateReviewCost({ ...input, calibration });
    this.post({
      type: 'estimate',
      reqId,
      base,
      head,
      filesChanged: stat.filesChanged,
      linesAdded: stat.insertions,
      linesRemoved: stat.deletions,
      depth,
      useSessionReuse,
      estimate: est,
    });
  }

  /**
   * Push the current values of the user-tunable settings to the client so the
   * Advanced Options panel can hydrate with the right initial values instead
   * of falling back to its hardcoded defaults. Called once on 'ready'.
   *
   * Settings surfaced: reasoningDepth, useSessionReuse, developerDiagnostics.
   * Other settings (model, baseBranch, etc.) are not user-tunable from the
   * panel — they stay in settings.json land.
   */
  private postCurrentSettings(): void {
    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    this.post({
      type: 'settings',
      depth: cfg.get<string>('reasoningDepth', 'deep'),
      useSessionReuse: cfg.get<boolean>('useSessionReuse', true),
      developerDiagnostics: cfg.get<boolean>('developerDiagnostics', false),
    });
  }

  /**
   * Persist a single setting changed via the Advanced Options panel. We try
   * to write at workspace scope when a workspace is open (so per-project
   * config sticks); otherwise fall back to global. The client gets an
   * acknowledgement so it can re-enable any disabled UI it disabled while
   * the write was in flight.
   *
   * Only a small allowlist of keys is writable from the panel — refuses
   * anything else so the message channel can't become an unrestricted
   * settings-write API.
   */
  private async updateSetting(key: string, value: unknown): Promise<void> {
    const ALLOWED: ReadonlySet<string> = new Set([
      'reasoningDepth',
      'useSessionReuse',
      'developerDiagnostics',
    ]);
    if (!ALLOWED.has(key)) {
      this.post({ type: 'settingUpdated', key, ok: false, error: 'not_allowed' });
      return;
    }
    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    try {
      await cfg.update(key, value, target);
      this.post({ type: 'settingUpdated', key, value, ok: true });
    } catch (e: any) {
      this.post({ type: 'settingUpdated', key, ok: false, error: e?.message ?? String(e) });
    }
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
