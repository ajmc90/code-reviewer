import * as vscode from 'vscode';
import { Finding, PassConfig, ReviewResult, Severity } from '../types';
import { PassFailureDecision, PassName, ReviewEvent, ReviewEventBus } from '../core/events';
import { BranchInfo, GitService } from '../git/gitService';
import { looksLikeSshAuthError, unlockSshKeyInteractive } from '../git/sshAuth';
import { Lang, messages, t } from '../i18n';

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
        if (msg?.type === 'ready') {
          for (const e of bus.snapshot()) this.post({ type: 'event', event: e });
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
      } catch (e: any) {
        this.post({ type: 'branchError', message: e?.message ?? String(e) });
      }
    });
  }

  private async refreshBranches() {
    const lang = this.deps.getLang();
    const git = this.deps.getGit();
    if (!git) {
      this.post({ type: 'branches', branches: [], remotes: [], defaultBase: null, currentBranch: null, error: t('notif.openFolderFirst', lang) });
      return;
    }
    const isRepo = await git.isRepo();
    if (!isRepo) {
      this.post({ type: 'branches', branches: [], remotes: [], defaultBase: null, currentBranch: null, error: t('notif.notGitRepoShort', lang) });
      return;
    }
    const [branches, remotes, defaultBase, currentBranch] = await Promise.all([
      git.listBranchesRich(),
      git.remotes(),
      git.detectDefaultBaseBranch(),
      git.currentBranch().catch(() => null),
    ]);
    this.post({ type: 'branches', branches, remotes, defaultBase, currentBranch });
  }

  private async fetchBranches(prune: boolean) {
    const git = this.deps.getGit();
    if (!git) return;
    this.post({ type: 'fetchStart' });
    try {
      const out = await this.tryFetchWithSshUnlock(git, prune);
      this.post({ type: 'fetchDone', output: out });
      await this.refreshBranches();
    } catch (e: any) {
      this.post({ type: 'fetchError', message: e?.message ?? String(e) });
    }
  }

  private async tryFetchWithSshUnlock(git: GitService, prune: boolean): Promise<string> {
    try {
      return await git.fetchAll({ prune });
    } catch (e: any) {
      const stderr = String(e?.message ?? '');
      if (!looksLikeSshAuthError(stderr)) throw e;

      this.post({ type: 'fetchPrompt', message: t('branch.fetchPrompt.ssh', this.deps.getLang()) });
      const r = await unlockSshKeyInteractive(stderr);
      if (r.outcome === 'cancel') {
        throw new Error('SSH unlock cancelled by user.');
      }
      if (r.outcome === 'fail') {
        throw new Error(`SSH unlock failed: ${r.error}`);
      }
      this.post({ type: 'fetchPrompt', message: t('branch.fetchPrompt.retry', this.deps.getLang()) });
      return await git.fetchAll({ prune });
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
    // Replay current state — the webview's 'ready' handshake will re-request
    // branches/events but result and partialSummary live extension-side.
    if (this.result) this.post({ type: 'result', result: this.result });
    this.post({ type: 'partialSummary', summary: this.deps.getPartialSummary() });
    for (const e of this.bus.snapshot()) this.post({ type: 'event', event: e });
  }

  /** Apply translation result returned by the extension's on-demand translator. */
  postFindingTranslation(payload: { id: string; lang: Lang; fields: any }) {
    this.post({ type: 'findingTranslated', ...payload });
  }

  /** Notify webview that a translation request is in flight. */
  postFindingTranslationPending(id: string, targetLang: Lang) {
    this.post({ type: 'findingTranslationPending', id, targetLang });
  }

  /** Notify webview that a translation request failed. */
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
<style>
/* ─────────────────────────────────────────────────────────────────
 * Design tokens — single source of truth for spacing, type, color.
 * ────────────────────────────────────────────────────────────── */
:root{
  /* Spacing — 4px base */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-7: 32px; --s-8: 40px;

  /* Type scale — 12 / 13 / 14 / 16 / 18 / 22 */
  --t-xs: 11px; --t-sm: 12px; --t-md: 13px; --t-lg: 14px; --t-xl: 16px; --t-2xl: 18px; --t-3xl: 22px;
  --lh-tight: 1.25; --lh-normal: 1.5; --lh-loose: 1.6;

  /* Radius */
  --r-sm: 4px; --r-md: 6px; --r-lg: 8px; --r-xl: 10px;

  /* Color — inherit from VS Code theme, with safe fallbacks */
  --bg:        var(--vscode-editor-background);
  --bg-elev:   var(--vscode-sideBar-background, var(--bg));
  --bg-inset:  var(--vscode-input-background, var(--bg));
  --bg-code:   var(--vscode-textCodeBlock-background, rgba(127,127,127,.1));
  --fg:        var(--vscode-foreground);
  --fg-muted:  color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
  --fg-subtle: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
  --border:    var(--vscode-panel-border, rgba(127,127,127,.25));
  --border-strong: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);

  /* Brand */
  --accent: #7c5cff;
  --accent-fg: #ffffff;
  --accent-tint: color-mix(in srgb, var(--accent) 14%, transparent);
  --accent-hover: #8c6dff;

  /* Severity — AA contrast verified on both light & dark themes */
  --sev-critical: #e5484d;
  --sev-major:    #f4b03c;
  --sev-minor:    #4493f8;
  --sev-nit:      #2eb886;
  --sev-praise:   #a374ff;

  /* Focus ring — same on all interactive elements */
  --focus: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);

  /* Motion */
  --dur-fast: 120ms;
  --dur-med: 200ms;
  --ease: cubic-bezier(.2,.7,.3,1);
}
@media (prefers-reduced-motion: reduce){
  :root{ --dur-fast: 0ms; --dur-med: 0ms; }
  *,*::before,*::after{ animation-duration:0ms!important; animation-iteration-count:1!important; transition-duration:0ms!important }
}

/* ─────────────────────────────────────────────────────────────────
 * Reset & globals
 * ────────────────────────────────────────────────────────────── */
*,*::before,*::after{ box-sizing:border-box }
[hidden]{ display:none!important }
html,body{ margin:0; padding:0 }
body{
  font-family: var(--vscode-font-family);
  font-size: var(--t-md);
  line-height: var(--lh-normal);
  color: var(--fg);
  background: var(--bg);
  height: 100vh;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
:focus{ outline:none }
:focus-visible{ box-shadow: var(--focus); border-radius: var(--r-sm) }
.sr-only{ position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); border:0 }

/* ─────────────────────────────────────────────────────────────────
 * Layout
 * ────────────────────────────────────────────────────────────── */
.app{ display:grid; grid-template-rows:auto 1fr; height:100vh }

header{
  display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  padding: var(--s-3) var(--s-5);
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent);
}
.brand{
  display:flex; align-items:center; gap:var(--s-2);
  font-size: var(--t-lg);
  font-weight:600;
  letter-spacing:-0.01em;
}
.brand-dot{
  width:8px; height:8px; border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  flex-shrink:0;
}
.branches-pill{
  display:none; align-items:center; gap:var(--s-1);
  padding: 3px var(--s-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  max-width: 320px;
  overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
}
.branches-pill[data-visible="1"]{ display:inline-flex }
.verdict{
  padding: var(--s-1) var(--s-3);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: .06em;
  color: var(--accent-fg);
  background: var(--fg-subtle);
}
.verdict[data-v="running"]{ background: var(--fg-subtle); animation: pulse 1.6s ease-in-out infinite }
.verdict[data-v="block"]            { background: var(--sev-critical) }
.verdict[data-v="needs-changes"]    { background: var(--sev-major); color:#1a1a1a }
.verdict[data-v="approve-with-comments"]{ background: var(--sev-minor) }
.verdict[data-v="approve"]          { background: var(--sev-nit); color:#0a2e1c }
.verdict[data-v="praise"]           { background: var(--sev-praise) }
@keyframes pulse{ 0%,100%{ opacity:.6 } 50%{ opacity:1 } }

.spacer{ flex:1 }

.counters{ display:flex; gap:var(--s-1); align-items:center; flex-wrap:wrap }
.counter{
  display:inline-flex; align-items:center; gap:var(--s-1);
  padding: 3px var(--s-2);
  border-radius: 999px;
  font-size: var(--t-xs);
  font-weight: 500;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.counter[data-active="1"]{ color: var(--fg); background: color-mix(in srgb, var(--fg) 14%, transparent) }
.counter .swatch{
  width:8px; height:8px; border-radius:50%;
  background: var(--fg-subtle);
  flex-shrink:0;
}
.counter[data-sev="critical"] .swatch{ background: var(--sev-critical) }
.counter[data-sev="major"]    .swatch{ background: var(--sev-major) }
.counter[data-sev="minor"]    .swatch{ background: var(--sev-minor) }
.counter[data-sev="nit"]      .swatch{ background: var(--sev-nit) }
.counter[data-sev="praise"]   .swatch{ background: var(--sev-praise) }

.toolbar{ display:flex; gap:var(--s-1); align-items:center }

/* Header language toggle — EN/ES segmented control */
.lang-toggle{
  display:inline-flex;
  border:1px solid var(--border);
  border-radius: var(--r-sm);
  overflow:hidden;
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .04em;
}
.lang-btn{
  appearance:none;
  background: transparent;
  color: var(--fg-muted);
  border: 0;
  padding: 3px var(--s-2);
  cursor: pointer;
  font: inherit;
  font-size: inherit;
  letter-spacing: inherit;
  font-weight: inherit;
}
.lang-btn + .lang-btn{ border-left: 1px solid var(--border) }
.lang-btn:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent); color: var(--fg) }
.lang-btn.is-active{ background: var(--accent); color: var(--accent-fg) }
.lang-btn.is-active:hover{ background: var(--accent-hover) }

/* Per-finding language chip — sits in the card head, lets the user
   override the global LANG for that one finding via on-demand translation. */
.lang-chip{
  appearance:none;
  display:inline-flex; align-items:center; justify-content:center;
  min-width: 26px;
  padding: 0 6px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  cursor: pointer;
  margin-left: var(--s-1);
}
.lang-chip:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent); color: var(--fg) }
.lang-chip.is-loading{
  opacity: .7;
  cursor: progress;
  font-size: 9px;
  letter-spacing: 0;
  text-transform: none;
}

/* Buttons — single source of truth */
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:var(--s-1);
  padding: 6px var(--s-3);
  font: inherit;
  font-size: var(--t-sm);
  font-weight: 500;
  line-height: 1;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  white-space: nowrap;
}
.btn:hover{ background: var(--vscode-button-hoverBackground) }
.btn:active{ transform: translateY(1px) }
.btn[aria-disabled="true"], .btn[disabled]{ opacity:.5; cursor:not-allowed }
.btn[aria-disabled="true"]:hover, .btn[disabled]:hover{ background: var(--vscode-button-background) }
.btn--ghost{
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
}
.btn--ghost:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent) }
.btn--xs{ padding: 3px var(--s-2); font-size: var(--t-xs) }
.btn--primary{
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 600;
}
.btn--primary:hover{ background: var(--accent-hover) }
.btn--danger{
  background: var(--vscode-errorForeground, #d13438);
  color: #fff;
  font-weight: 600;
}
.btn--danger:hover{ filter: brightness(1.1) }

/* ─────────────────────────────────────────────────────────────────
 * Two-pane layout — resizable left pane + drag gutter + collapsible
 * ────────────────────────────────────────────────────────────── */
:root{
  --left-w: 420px;
  --left-min: 280px;
  --left-max: 720px;
  --rail-w: 56px;
}
main{
  display:grid;
  grid-template-columns: var(--left-w) 6px minmax(0, 1fr);
  min-height: 0;
  transition: grid-template-columns var(--dur-med) var(--ease);
}
main[data-collapsed="1"]{
  grid-template-columns: var(--rail-w) 6px minmax(0, 1fr);
}
.left{
  display:flex; flex-direction:column; gap:var(--s-5);
  overflow-y:auto; overflow-x:hidden;
  padding: var(--s-5);
  background: var(--bg-elev);
  min-width: 0;
  container-type: inline-size;
  container-name: left;
  position: relative;
}
main[data-collapsed="1"] .left{
  padding: var(--s-3) var(--s-2);
  overflow: hidden;
}
main[data-collapsed="1"] .left > .left-full{ display: none }
.left-full{ display:flex; flex-direction:column; gap: var(--s-5) }
.left-rail{ display: none }
main[data-collapsed="1"] .left > .left-rail{ display: flex }

.right{
  overflow:auto;
  padding: var(--s-5) var(--s-6);
  min-width: 0;
}
.left::-webkit-scrollbar, .right::-webkit-scrollbar{ width:10px; height:10px }
.left::-webkit-scrollbar-thumb, .right::-webkit-scrollbar-thumb{
  background: color-mix(in srgb, var(--fg) 14%, transparent); border-radius: var(--r-sm);
}

/* Drag gutter between panes */
.gutter{
  position: relative;
  width: 6px;
  cursor: col-resize;
  background: var(--border);
  transition: background var(--dur-fast) var(--ease);
  user-select: none;
  flex-shrink: 0;
  z-index: 5;
}
.gutter::before{
  content: '';
  position: absolute;
  inset: 0 -3px;          /* enlarge hit area */
}
.gutter:hover, .gutter[data-active="1"]{
  background: var(--accent);
}
.gutter::after{
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 2px; height: 32px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--fg) 30%, transparent);
  transition: background var(--dur-fast) var(--ease);
}
.gutter:hover::after, .gutter[data-active="1"]::after{ background: var(--accent-fg) }
main[data-resizing="1"]{ transition: none; cursor: col-resize }
main[data-resizing="1"] *{ user-select: none !important; pointer-events: none }
main[data-resizing="1"] .gutter{ pointer-events: auto }

/* Left collapse toggle button */
.collapse-btn{
  position: absolute;
  top: var(--s-3);
  right: var(--s-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  z-index: 4;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.collapse-btn:hover{ background: var(--accent-tint); color: var(--fg) }
main[data-collapsed="1"] .collapse-btn{
  right: 50%; transform: translateX(50%);
}

/* Mini rail (visible when left is collapsed) */
.left-rail{
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  padding-top: var(--s-7);
  width: 100%;
}
.rail-dot{
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--fg-subtle);
  flex-shrink: 0;
}
.rail-dot[data-state="running"]{ background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: pulse 1.6s ease-in-out infinite }
.rail-dot[data-state="done"]    { background: var(--sev-nit) }
.rail-dot[data-state="error"]   { background: var(--sev-critical) }

.rail-vert{
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: var(--t-xs);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--fg-muted);
  white-space: nowrap;
  max-height: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail-stats{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: var(--s-3);
  font-variant-numeric: tabular-nums;
}
.rail-stat{
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  color: var(--fg-muted);
  line-height: 1.1;
}
.rail-stat b{ font-size: var(--t-md); color: var(--fg); font-weight: 600 }
.rail-stat[data-sev="critical"] b{ color: var(--sev-critical) }
.rail-stat[data-sev="major"]    b{ color: var(--sev-major) }
.rail-stat[data-sev="minor"]    b{ color: var(--sev-minor) }
.rail-stat[data-sev="nit"]      b{ color: var(--sev-nit) }

.rail-spinner{
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
  margin-top: var(--s-3);
}
main:not([data-collapsed="1"]) .rail-spinner{ display:none }

/* ─────────────────────────────────────────────────────────────────
 * Passes (analysis aspects) selector
 * ────────────────────────────────────────────────────────────── */
.section--passes{
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
}
.passes{
  display:flex; flex-direction: column; gap: var(--s-3);
}
.passes-head{
  display:flex; align-items:center; gap: var(--s-2);
  width: 100%;
}
.passes-head .section-title{ flex: 1; margin: 0 }
.passes-head .passes-actions{ display:flex; gap: 4px }
.passes-head .link{
  background: transparent; border: 0; cursor: pointer;
  color: var(--accent); font: inherit; font-size: var(--t-xs);
  padding: 2px 4px; border-radius: var(--r-sm);
}
.passes-head .link:hover{ background: var(--accent-tint) }
.passes-head .passes-count{ color: var(--fg-subtle); font-size: var(--t-xs) }

/* Presets */
.presets{
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
}
.presets__label{
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-right: 2px;
}
.preset{
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 500;
  padding: 3px var(--s-2);
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.preset:hover{ background: color-mix(in srgb, var(--fg) 5%, transparent); color: var(--fg) }
.preset[aria-pressed="true"]{
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--fg);
}

/* Pass groups */
.pass-group{
  display: flex; flex-direction: column; gap: var(--s-1);
}
.pass-group__h{
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}
.pass-group__pills{
  display: flex; flex-wrap: wrap; gap: 6px;
}

/* Pass pill (replaces .checkpill for passes) */
.pass-pill{
  position: relative;
  display: inline-flex; align-items: center; gap: var(--s-1);
  padding: 4px var(--s-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  background: var(--bg);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.pass-pill input{ margin: 0; cursor: pointer; accent-color: var(--accent) }
.pass-pill:hover{ background: color-mix(in srgb, var(--fg) 5%, transparent) }
.pass-pill:has(input:checked){
  color: var(--fg);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
}
.pass-pill__cond{
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--warn, #f4b03c) 25%, transparent);
  color: color-mix(in srgb, var(--warn, #f4b03c) 90%, var(--fg) 10%);
}

/* Rich tooltip — appears on hover/focus. CSS-only, no JS. */
.pass-tip{
  position: absolute;
  z-index: 20;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  max-width: 320px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: var(--vscode-editorWidget-background, var(--bg));
  border: 1px solid var(--border);
  color: var(--fg);
  font-size: var(--t-xs);
  line-height: 1.45;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  display: grid;
  gap: 4px;
  white-space: normal;
}
.pass-pill:hover .pass-tip,
.pass-pill:focus-within .pass-tip{
  opacity: 1;
  transform: translateY(0);
}
.pass-tip__title{ font-weight: 600; color: var(--fg) }
.pass-tip__hint{ color: var(--fg-muted) }
.pass-tip__detail{ color: var(--fg-subtle); font-size: 11px; font-style: italic }

/* Estimate footer */
.passes-estimate{
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}
.passes-estimate:empty{ display: none }

/* Section primitive */
.section{ display:flex; flex-direction:column; gap:var(--s-3); min-width:0 }
.section-title{
  margin:0;
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

/* ─────────────────────────────────────────────────────────────────
 * Branch picker
 * ────────────────────────────────────────────────────────────── */
.picker{
  display:flex; flex-direction:column; gap:var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
  min-width: 0;
}
.picker-row{ display:flex; gap:var(--s-2); align-items:center; flex-wrap:wrap; min-width:0 }

.input, .search{
  font: inherit;
  font-size: var(--t-sm);
  padding: 6px var(--s-2);
  background: var(--bg-inset);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  min-width: 0;
  width: 100%;
}
.input::placeholder, .search::placeholder{ color: var(--fg-subtle) }
.input:focus-visible, .search:focus-visible{
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}
.picker-row .search{ flex:1 1 140px }

.checkpill{
  display:inline-flex; align-items:center; gap:var(--s-1);
  padding: 3px var(--s-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.checkpill:hover{ background: color-mix(in srgb, var(--fg) 5%, transparent) }
.checkpill input{ margin:0; cursor:pointer }
.checkpill:has(input:checked){
  color: var(--fg);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}

.picker-meta{
  margin-left:auto;
  color: var(--fg-muted);
  font-size: var(--t-xs);
  min-width: 0;
  white-space: nowrap; overflow:hidden; text-overflow:ellipsis;
}

.picker-cols{
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  gap: var(--s-2);
  min-width: 0;
}
.picker-col{ display:flex; flex-direction:column; gap:var(--s-1); min-width:0 }
.picker-col-head{
  display:flex; align-items:center; gap:var(--s-1);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
  min-width: 0;
}
.picker-col-head .role{ color: var(--fg) }
.picker-col-head .hint{
  font-weight: 400; text-transform:none; letter-spacing:0;
  color: var(--fg-subtle);
  font-size: 10px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

.branch-list{
  height: 240px; max-height: 38vh; min-height: 160px;
  overflow-y: auto; overflow-x: hidden;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
  min-width: 0;
  scrollbar-gutter: stable;
}
.branch{
  padding: var(--s-2);
  border-bottom: 1px solid color-mix(in srgb, var(--fg) 5%, transparent);
  cursor: pointer;
  font-size: var(--t-xs);
  display: flex; flex-direction: column; gap: 3px;
  min-width: 0; overflow: hidden;
  transition: background var(--dur-fast) var(--ease);
}
.branch:last-child{ border-bottom: 0 }
.branch:hover{ background: color-mix(in srgb, var(--accent) 10%, transparent) }
.branch[aria-selected="true"]{
  background: var(--accent);
  color: var(--accent-fg);
}
.branch[aria-selected="true"] .branch-meta,
.branch[aria-selected="true"] .badge{ color: rgba(255,255,255,.92) }
.branch[aria-selected="true"] .badge{ background: rgba(255,255,255,.22) }
.branch-name{
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-sm);
  font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.branch-badges{ display:flex; flex-wrap:wrap; gap:3px; min-width:0 }
.badge{
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  color: var(--fg-muted);
  font-family: var(--vscode-font-family);
  font-weight: 500;
  max-width: 100%;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.branch-meta{
  color: var(--fg-muted);
  font-size: 10px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  min-width: 0; max-width: 100%;
}
.branch-empty{ padding: var(--s-3); color: var(--fg-subtle); font-size: var(--t-xs); text-align:center }

.picker-actions{ display:flex; align-items:center; gap:var(--s-2); justify-content:space-between; flex-wrap:wrap; row-gap:var(--s-2) }
.picker-actions .btn{ flex:0 1 auto; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.picker-actions .btn .branch-ref{ display:inline-block; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; font-family:var(--vscode-editor-font-family); font-size:.9em }
.ab-pill{
  display:inline-flex; align-items:center; gap:var(--s-1);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}
.ab-pill .ahead{ color: var(--sev-nit); font-weight:500 }
.ab-pill .behind{ color: var(--sev-major); font-weight:500 }
.ab-pill .same{ color: var(--fg-subtle); font-style:italic }

.notice{
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  line-height: var(--lh-normal);
  overflow-wrap: anywhere;
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
}
.notice[data-empty="1"]{ display:none }
.notice--error{ background: color-mix(in srgb, var(--sev-critical) 12%, transparent); color: var(--sev-critical); border:1px solid color-mix(in srgb, var(--sev-critical) 30%, transparent) }

/* ─────────────────────────────────────────────────────────────────
 * Timeline (live activity)
 * ────────────────────────────────────────────────────────────── */
.timeline{ display:flex; flex-direction:column; gap:var(--s-1) }
.timeline-empty{ color: var(--fg-subtle); font-size: var(--t-xs); padding: var(--s-1) }
.step{
  display:flex; gap:var(--s-3); align-items:flex-start;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  border: 1px solid transparent;
  min-width: 0;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.step .ico{
  width: 22px; height: 22px;
  border-radius: 50%;
  display:grid; place-items:center;
  font-size: var(--t-sm);
  font-weight: 700;
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  color: var(--fg);
  flex-shrink: 0;
}
.step.running{ border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: var(--accent-tint) }
.step.running .ico{ background: var(--accent); color: var(--accent-fg); animation: spin 1.4s linear infinite }
.step.done .ico{ background: var(--sev-nit); color: #0a2e1c }
.step.error .ico{ background: var(--sev-critical); color: #fff }
.step.awaitDecision{ border-color: color-mix(in srgb, var(--sev-major) 55%, transparent); background: color-mix(in srgb, var(--sev-major) 10%, transparent) }
.step.awaitDecision .ico{ background: var(--sev-major); color: #1a1100 }
.step.skipped .ico{ background: color-mix(in srgb, var(--fg) 22%, transparent); color: var(--fg-muted) }
.step.skipped .label{ color: var(--fg-muted); text-decoration: line-through }
@keyframes spin{ from{ transform:rotate(0) } to{ transform:rotate(360deg) } }

.step .actions{
  display:flex; gap: var(--s-2); margin-top: 6px; flex-wrap: wrap;
}
.step .actions button{
  display:inline-flex; align-items:center; gap: 4px;
  padding: 3px var(--s-2);
  font: inherit; font-size: var(--t-xs); font-weight: 500;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.step .actions button:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent) }
.step .actions button.primary{ background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight:600 }
.step .actions button.primary:hover{ background: var(--accent-hover) }
.step .actions button.danger{ background: var(--vscode-errorForeground, #d13438); color: #fff; border-color: transparent; font-weight:600 }
.step .actions button.danger:hover{ filter: brightness(1.1) }

.resume-banner{
  display: none;
  margin: 0 0 var(--s-2);
  padding: var(--s-3);
  background: color-mix(in srgb, var(--sev-major) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--sev-major) 35%, transparent);
  border-radius: var(--r-md);
  gap: var(--s-3);
  align-items: flex-start;
}
.resume-banner[data-visible="1"]{ display: flex }
.resume-banner .text{ flex:1 1 auto; min-width:0 }
.resume-banner .text h3{ margin: 0 0 4px; font-size: var(--t-sm); color: var(--fg); font-weight: 600 }
.resume-banner .text p{ margin: 0; color: var(--fg-muted); font-size: var(--t-xs); overflow-wrap: anywhere; line-height: var(--lh-normal) }
.resume-banner .actions{ display: flex; gap: var(--s-2); flex-shrink: 0 }
.resume-banner .ico{
  font-size: 18px; line-height: 1; padding-top: 1px; color: var(--sev-major);
}

.step .body{ flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:2px }
.step .label{
  display:flex; align-items:baseline; gap:var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--fg);
}
.step.running .label{ color: var(--accent) }
.step .elapsed{
  margin-left:auto;
  font-size: 10px;
  font-weight: 400;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.step .meta{
  font-size: var(--t-xs);
  color: var(--fg-muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.step .activity{
  font-size: 10px;
  font-family: var(--vscode-editor-font-family);
  color: var(--fg-subtle);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

/* ─────────────────────────────────────────────────────────────────
 * Log
 * ────────────────────────────────────────────────────────────── */
.log-header{ display:flex; align-items:center; gap:var(--s-2) }
.log-header .section-title{ flex:1; margin:0 }
.log-count{ color: var(--fg-subtle); font-weight: 400; font-size: var(--t-xs) }

.live{
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-2);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  line-height: 1.5;
  max-height: 320px;
  min-height: 88px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg-muted);
  scrollbar-gutter: stable;
}
.live.empty{
  display:flex; align-items:center; justify-content:center;
  color: var(--fg-subtle);
  font-family: var(--vscode-font-family);
  font-style: italic;
  text-align: center;
}
.live .line{ padding: 1px 0 }
.live .line.warn{ color: var(--sev-major) }
.live .line.error{ color: var(--sev-critical) }
.live .ts{ color: var(--fg-subtle); margin-right: var(--s-2); font-size: 10px }
.live .pass{ display:inline-block; min-width: 60px; color: var(--accent); margin-right: var(--s-1); font-weight: 500 }

/* ─────────────────────────────────────────────────────────────────
 * Right column — exec summary, bullets, filters, findings
 * ────────────────────────────────────────────────────────────── */
.exec{
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
  margin-bottom: var(--s-5);
}
.exec h2{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.exec p{
  margin: 0;
  font-size: var(--t-md);
  line-height: var(--lh-loose);
  color: var(--fg);
}

.bullets{
  display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: var(--s-3);
  margin-bottom: var(--s-5);
}
.bullets .card{
  padding: var(--s-4);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--bg);
}
.bullets h3{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.bullets ul{ margin: 0; padding-left: var(--s-4) }
.bullets li{ margin-bottom: 4px; line-height: var(--lh-normal) }
.bullets li:last-child{ margin-bottom: 0 }

.filters-wrap{
  display:flex; flex-direction: column; gap: var(--s-2);
  margin-bottom: var(--s-3);
}
.filters{
  display:flex; gap:var(--s-1); flex-wrap:wrap; align-items:center;
}
.filter{
  padding: 4px var(--s-3);
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.filter:hover{ color: var(--fg); background: color-mix(in srgb, var(--fg) 6%, transparent) }
.filter[aria-pressed="true"]{
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}
.filters .search{ flex: 1 1 220px; min-width: 160px; width:auto }
.filters-cat{
  display:flex; gap: 4px; flex-wrap:wrap; align-items:center;
}
.filters-cat .filter-cat-label{
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  margin-right: var(--s-1);
  font-weight: 600;
}
.cat-chip{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--s-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  text-transform: lowercase;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.cat-chip:hover{ color: var(--fg); background: color-mix(in srgb, var(--fg) 6%, transparent) }
.cat-chip[aria-pressed="true"]{
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--fg);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.cat-chip .count{
  font-variant-numeric: tabular-nums;
  color: var(--fg-subtle);
  font-size: 10px;
}
.cat-chip[aria-pressed="true"] .count{ color: var(--accent-fg); background: color-mix(in srgb, var(--accent) 50%, transparent); padding: 0 4px; border-radius: 6px }
.cat-chip[data-empty="1"]{ opacity: .45 }

/* ─────────────────────────────────────────────────────────────────
 * Finding cards
 * ────────────────────────────────────────────────────────────── */
.findings{ display:flex; flex-direction:column; gap: var(--s-3) }
.finding{
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--bg);
  overflow: hidden;
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.finding:hover{ border-color: var(--border-strong) }
.finding[data-severity="critical"]{ border-left: 3px solid var(--sev-critical) }
.finding[data-severity="major"]   { border-left: 3px solid var(--sev-major) }
.finding[data-severity="minor"]   { border-left: 3px solid var(--sev-minor) }
.finding[data-severity="nit"]     { border-left: 3px solid var(--sev-nit) }
.finding[data-severity="praise"]  { border-left: 3px solid var(--sev-praise) }

.finding-head{
  display:flex; align-items:center; gap: var(--s-2);
  width:100%;
  padding: var(--s-3);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: background var(--dur-fast) var(--ease);
}
.finding-head:hover{ background: color-mix(in srgb, var(--fg) 4%, transparent) }
.chevron{
  flex-shrink:0;
  width: 14px;
  color: var(--fg-muted);
  transition: transform var(--dur-fast) var(--ease);
}
.finding[aria-expanded="true"] .chevron{ transform: rotate(90deg) }

.sev{
  padding: 2px var(--s-2);
  border-radius: var(--r-sm);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  color: #fff;
  flex-shrink: 0;
  text-transform: uppercase;
}
.sev[data-sev="critical"]{ background: var(--sev-critical) }
.sev[data-sev="major"]   { background: var(--sev-major); color:#1a1a1a }
.sev[data-sev="minor"]   { background: var(--sev-minor) }
.sev[data-sev="nit"]     { background: var(--sev-nit); color:#0a2e1c }
.sev[data-sev="praise"]  { background: var(--sev-praise) }

.cat{
  font-size: 10px;
  padding: 2px var(--s-2);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
  flex-shrink: 0;
  text-transform: lowercase;
}
.title{
  flex:1;
  font-size: var(--t-md);
  font-weight: 500;
  min-width: 0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.loc{
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px var(--s-1);
  border-radius: var(--r-sm);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.loc:hover{ color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent) }
.conf{
  font-size: 10px;
  color: var(--fg-subtle);
  text-transform: lowercase;
  flex-shrink: 0;
}

.finding-body{ display:none; border-top: 1px solid var(--border) }
.finding[aria-expanded="true"] .finding-body{ display:block }

.grid2{
  display:grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  gap: 0;
}
.col{ padding: var(--s-4); min-width:0 }
.col + .col{
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 3%, transparent);
}
.col h4{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
  display:flex; align-items:center; gap:var(--s-1);
}
.col h4 + h4{ margin-top: var(--s-3) }
.col p{ margin: 0 0 var(--s-2); line-height: var(--lh-loose); font-size: var(--t-md) }
.col .qa{ margin: var(--s-1) 0 var(--s-2); padding-left: var(--s-4) }
.col .qa li{ margin-bottom: 4px; color: var(--fg-muted); line-height: var(--lh-normal) }

.evidence{
  background: var(--bg-code);
  border-left: 3px solid var(--accent);
  padding: var(--s-2) var(--s-3);
  margin: var(--s-1) 0;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  line-height: 1.55;
  white-space: pre-wrap;
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  overflow-x: auto;
}
.fix{
  display: block;
  background: var(--bg-code);
  padding: var(--s-3);
  border-radius: var(--r-md);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-sm);
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
  margin: var(--s-1) 0 var(--s-2);
}
.fix-conf{ font-size: 10px; color: var(--fg-subtle) }

.actions{
  padding: var(--s-2) var(--s-3);
  border-top: 1px solid var(--border);
  display:flex; gap:var(--s-1); flex-wrap:wrap;
  background: color-mix(in srgb, var(--fg) 2%, transparent);
}

.empty-state{
  padding: var(--s-8) var(--s-5);
  text-align: center;
  color: var(--fg-subtle);
  font-size: var(--t-md);
  line-height: var(--lh-loose);
}
.empty-state kbd{
  display: inline-block;
  padding: 1px var(--s-1);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  color: var(--fg);
  background: var(--bg-inset);
}

/* ─────────────────────────────────────────────────────────────────
 * Responsive
 * ────────────────────────────────────────────────────────────── */
@container left (max-width: 340px){
  .picker-cols{ grid-template-columns: minmax(0,1fr) }
}
@media (max-width: 760px){
  main{ grid-template-columns: minmax(0,1fr) !important; grid-template-rows: auto auto 1fr }
  .gutter{ display:none }
  .left{ border-right: 0; border-bottom: 1px solid var(--border) }
  .grid2{ grid-template-columns: minmax(0,1fr) }
  .col + .col{ border-left: 0; border-top: 1px solid var(--border) }
  .bullets{ grid-template-columns: minmax(0,1fr) }
}

/* High-contrast theme adjustments */
@media (forced-colors: active){
  .verdict{ border: 1px solid CanvasText }
  .sev, .badge, .cat, .counter{ border: 1px solid CanvasText }
  .btn, .filter{ border: 1px solid CanvasText }
  .branch[aria-selected="true"]{ outline: 2px solid Highlight }
}
</style>
</head>
<body>
<div class="app">

  <header role="banner">
    <div class="brand" aria-label="${trE('panel.brand')}">
      <span class="brand-dot" aria-hidden="true"></span>
      <span>${trE('panel.brand')}</span>
    </div>
    <span id="branches" class="branches-pill" aria-live="polite"></span>
    <span id="verdict" class="verdict" data-v="idle" role="status" aria-live="polite">${trE('panel.verdictIdle')}</span>
    <span class="spacer"></span>
    <div class="counters" role="group" aria-label="${trE('panel.findingsBySeverity')}">
      <span class="counter" data-sev="critical" title="${trE('panel.criticalFindings')}"><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.critical')}:</span><b id="c-critical">0</b></span>
      <span class="counter" data-sev="major"    title="${trE('panel.majorFindings')}"   ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.major')}:</span><b id="c-major">0</b></span>
      <span class="counter" data-sev="minor"    title="${trE('panel.minorFindings')}"   ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.minor')}:</span><b id="c-minor">0</b></span>
      <span class="counter" data-sev="nit"      title="${trE('panel.nitFindings')}"     ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.nit')}:</span><b id="c-nit">0</b></span>
      <span class="counter" data-sev="praise"   title="${trE('panel.praiseFindings')}"  ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.praise')}:</span><b id="c-praise">0</b></span>
    </div>
    <div class="toolbar">
      <div class="lang-toggle" role="group" aria-label="${trE('lang.toggleAria')}">
        <button class="lang-btn${lang === 'en' ? ' is-active' : ''}" type="button" data-lang="en" aria-pressed="${lang === 'en'}">${trE('lang.en')}</button>
        <button class="lang-btn${lang === 'es' ? ' is-active' : ''}" type="button" data-lang="es" aria-pressed="${lang === 'es'}">${trE('lang.es')}</button>
      </div>
      <button class="btn btn--ghost btn--xs" id="btn-export" type="button" aria-label="${trE('panel.exportAria')}">${trE('panel.export')}</button>
    </div>
  </header>

  <main id="main">
    <aside class="left" aria-label="${trE('panel.reviewControls')}">

      <button class="collapse-btn" id="btn-collapse" type="button" aria-label="${trE('panel.collapse')}" title="${trE('panel.collapseTitle')}">
        <span id="collapse-icon" aria-hidden="true">‹</span>
      </button>

      <div class="left-rail" id="left-rail" aria-hidden="true" aria-label="${trE('panel.collapsedSummary')}">
        <span class="rail-dot" id="rail-dot" data-state="idle" title="${trE('panel.statusTitle')}"></span>
        <div class="rail-vert" id="rail-branches" title=""></div>
        <div class="rail-vert" id="rail-pass" title="${trE('panel.currentPass')}"></div>
        <div class="rail-spinner" id="rail-spinner" aria-hidden="true"></div>
        <div class="rail-stats" id="rail-stats">
          <div class="rail-stat" data-sev="critical" title="${trE('panel.critical')}"><b id="rail-c-critical">0</b><span>crit</span></div>
          <div class="rail-stat" data-sev="major" title="${trE('panel.major')}"><b id="rail-c-major">0</b><span>maj</span></div>
          <div class="rail-stat" data-sev="minor" title="${trE('panel.minor')}"><b id="rail-c-minor">0</b><span>min</span></div>
          <div class="rail-stat" data-sev="nit" title="${trE('panel.nit')}"><b id="rail-c-nit">0</b><span>nit</span></div>
        </div>
      </div>

      <div class="left-full">

        <div class="resume-banner" id="resume-banner" role="alert">
          <span class="ico" aria-hidden="true">⏸</span>
          <div class="text">
            <h3 id="resume-banner-title">${trE('panel.pausedTitle')}</h3>
            <p id="resume-banner-detail"></p>
          </div>
          <div class="actions">
            <button class="primary" type="button" id="btn-resume">${trE('panel.resume')}</button>
            <button type="button" id="btn-discard-partial" title="${trE('panel.discardTitle')}">${trE('panel.discard')}</button>
          </div>
        </div>

        <section class="section" aria-labelledby="branch-picker-title">
          <h2 class="section-title" id="branch-picker-title">${trE('panel.branchPicker')}</h2>
          <div class="picker" role="group" aria-label="${trE('panel.chooseBaseHead')}">

            <div class="picker-row">
              <label class="sr-only" for="branch-filter">${trE('panel.filterBranches')}</label>
              <input
                class="search"
                id="branch-filter"
                type="search"
                placeholder="${trE('panel.branchFilterPlaceholder')}"
                autocomplete="off"
                spellcheck="false"
              />
              <button class="btn btn--ghost btn--xs" id="btn-fetch" type="button" title="${trE('panel.fetchTitle')}" aria-label="${trE('panel.fetchAria')}">
                <span aria-hidden="true">⟳</span> ${trE('panel.fetch')}
              </button>
            </div>

            <div class="picker-row">
              <label class="checkpill"><input type="checkbox" id="show-local" checked> ${trE('panel.local')}</label>
              <label class="checkpill"><input type="checkbox" id="show-remote" checked> ${trE('panel.remote')}</label>
              <span class="picker-meta" id="branches-meta" aria-live="polite"></span>
            </div>

            <div class="picker-cols">
              <div class="picker-col">
                <div class="picker-col-head"><span class="role">${trE('panel.base')}</span><span class="hint" id="base-current"></span></div>
                <div class="branch-list" id="base-list" role="listbox" aria-label="${trE('panel.baseAria')}" tabindex="0"></div>
              </div>
              <div class="picker-col">
                <div class="picker-col-head"><span class="role">${trE('panel.head')}</span><span class="hint" id="head-current"></span></div>
                <div class="branch-list" id="head-list" role="listbox" aria-label="${trE('panel.headAria')}" tabindex="0"></div>
              </div>
            </div>

            <div class="picker-actions">
              <span class="ab-pill" id="ab-pill" aria-live="polite"></span>
              <button class="btn btn--primary" id="btn-start" type="button" aria-disabled="true">
                <span aria-hidden="true">▶</span> ${trE('panel.startReview')}
              </button>
            </div>

            <div id="branch-error" class="notice notice--error" data-empty="1" role="alert"></div>
          </div>
        </section>

        <section class="section section--passes" aria-labelledby="passes-title">
          <div class="passes-head">
            <h2 class="section-title" id="passes-title">${trE('panel.analysisPasses')} <span class="passes-count" id="passes-count"></span></h2>
            <div class="passes-actions">
              <button type="button" class="link" id="btn-passes-none" title="${trE('panel.selectNoneTitle')}">${trE('panel.selectNone')}</button>
            </div>
          </div>
          <div class="presets" id="presets" role="group" aria-label="${trE('panel.presetsLabel')}">
            <span class="presets__label">${trE('panel.presetsLabel')}</span>
            <button type="button" class="preset" data-preset="all"      title="${trE('panel.presetAllTitle')}">${trE('panel.presetAll')}</button>
            <button type="button" class="preset" data-preset="fast"     title="${trE('panel.presetFastTitle')}">${trE('panel.presetFast')}</button>
            <button type="button" class="preset" data-preset="deep"     title="${trE('panel.presetDeepTitle')}">${trE('panel.presetDeep')}</button>
            <button type="button" class="preset" data-preset="security" title="${trE('panel.presetSecurityTitle')}">${trE('panel.presetSecurity')}</button>
          </div>
          <div class="passes" id="passes" role="group" aria-label="${trE('panel.choosePasses')}"></div>
          <div class="passes-estimate" id="passes-estimate" aria-live="polite"></div>
        </section>

        <section class="section" aria-labelledby="activity-title">
          <h2 class="section-title" id="activity-title">${trE('panel.liveActivity')}</h2>
          <div class="timeline" id="timeline" aria-live="polite"></div>
        </section>

        <section class="section" aria-labelledby="log-title">
          <div class="log-header">
            <h2 class="section-title" id="log-title">${trE('panel.log')} <span class="log-count" id="log-count"></span></h2>
            <button class="btn btn--ghost btn--xs" id="btn-copy-log" type="button" aria-label="${trE('panel.copyLogAria')}">${trE('panel.copy')}</button>
            <button class="btn btn--ghost btn--xs" id="btn-clear-log" type="button" aria-label="${trE('panel.clearLogAria')}">${trE('panel.clear')}</button>
          </div>
          <div class="live empty" id="live" role="log" aria-live="polite" aria-label="${trE('panel.reviewLog')}">${trE('panel.noActivity')}</div>
        </section>

      </div>

    </aside>

    <div class="gutter" id="gutter" role="separator" aria-orientation="vertical" aria-label="${trE('panel.resize')}" tabindex="0" aria-valuemin="280" aria-valuemax="720" aria-valuenow="420"></div>

    <section class="right" aria-label="${trE('panel.reviewResults')}">
      <div id="exec" class="exec" hidden>
        <h2>${trE('panel.execSummary')}</h2>
        <p id="exec-text"></p>
      </div>

      <div class="bullets" id="bullets" hidden>
        <div class="card"><h3>${trE('panel.topConcerns')}</h3><ul id="concerns"></ul></div>
        <div class="card"><h3>${trE('panel.strengths')}</h3><ul id="strengths"></ul></div>
      </div>

      <div class="filters-wrap">
        <div class="filters" role="group" aria-label="${trE('panel.filterBySeverity')}">
          <button class="filter" type="button" data-f="all" aria-pressed="true">${trE('panel.filterAll')}</button>
          <button class="filter" type="button" data-f="critical" aria-pressed="false">${trE('panel.critical')}</button>
          <button class="filter" type="button" data-f="major" aria-pressed="false">${trE('panel.major')}</button>
          <button class="filter" type="button" data-f="minor" aria-pressed="false">${trE('panel.minor')}</button>
          <button class="filter" type="button" data-f="nit" aria-pressed="false">${trE('panel.nit')}</button>
          <button class="filter" type="button" data-f="praise" aria-pressed="false">${trE('panel.praise')}</button>
          <label class="sr-only" for="search">${trE('panel.filterByText')}</label>
          <input class="search" id="search" type="search" placeholder="${trE('panel.findingsSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="filters-cat" id="cat-filters" role="group" aria-label="${trE('panel.filterByCategory')}"></div>
      </div>

      <div id="findings" class="findings" role="region" aria-label="${trE('panel.findingsRegion')}"></div>

      <div id="empty" class="empty-state">${tr('panel.emptyState')}</div>
    </section>
  </main>

</div>

<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ─── i18n ───────────────────────────────────────────────────
  // The host injects the whole dictionary so the webview can render
  // dynamic content (passes, findings, statuses) in the active language
  // without round-tripping each label.
  const MESSAGES = ${JSON.stringify(messages)};
  let LANG = ${JSON.stringify(lang)};
  function tMsg(key, params){
    const dict = MESSAGES[LANG] || MESSAGES.en;
    const tmpl = (dict && dict[key]) || (MESSAGES.en && MESSAGES.en[key]) || key;
    if (!params) return tmpl;
    return String(tmpl).replace(/\\{(\\w+)\\}/g, (_, k) => {
      const v = params[k];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  // PASS_DEFS keeps stable keys; labels/hints come from i18n at render time.
  // family = layout grouping; conditional = pass only fires under specific
  // diff shapes (don't surprise the user with zero findings); costSec is a
  // rough lower/upper Claude-call estimate used to render the runtime hint.
  const PASS_DEFS = [
    { key: 'structural',    family: 'foundation', costSec: [25, 50] },
    { key: 'explore',       family: 'foundation', costSec: [40, 80] },
    { key: 'security',      family: 'quality',    costSec: [35, 70] },
    { key: 'performance',   family: 'quality',    costSec: [30, 60] },
    { key: 'accessibility', family: 'quality',    costSec: [25, 50], conditional: 'ui-only' },
    { key: 'tests',         family: 'quality',    costSec: [30, 60] },
    { key: 'gaps',          family: 'quality',    costSec: [35, 70] },
    { key: 'permute',       family: 'reasoning',  costSec: [40, 80] },
    { key: 'critique',      family: 'reasoning',  costSec: [40, 80] },
  ];
  // Presets — each lists keys that should be enabled; everything else off.
  const PASS_PRESETS = {
    all:      PASS_DEFS.map(p => p.key),
    fast:     ['structural', 'explore', 'critique'],
    deep:     PASS_DEFS.map(p => p.key),
    security: ['structural', 'security', 'gaps', 'critique'],
  };
  const FAMILY_ORDER = ['foundation', 'quality', 'reasoning'];
  function passLabel(key){ return tMsg('pass.' + key + '.label'); }
  function passHint(key){  return tMsg('pass.' + key + '.hint');  }
  function passDetail(key){ return tMsg('pass.' + key + '.detail'); }
  function familyLabel(name){ return tMsg('passes.family.' + name); }
  const PASS_KEY_SET = new Set(PASS_DEFS.map(p => p.key));

  /** Sum costSec ranges for active passes → "~Xm" / "~X–Ym". */
  function formatEstimate(){
    let lo = 0, hi = 0, n = 0;
    for (const def of PASS_DEFS){
      if (!state.passes[def.key]) continue;
      n++;
      lo += def.costSec[0];
      hi += def.costSec[1];
    }
    if (n === 0) return '';
    const fmt = (s) => {
      if (s < 60) return s + 's';
      const m = Math.round(s / 60);
      return m + 'm';
    };
    const range = fmt(lo) === fmt(hi) ? fmt(lo) : (fmt(lo) + '–' + fmt(hi));
    return tMsg('passes.estimate', { range: range, calls: n });
  }
  /** Currently-matching preset name, or null if no exact match. */
  function activePresetName(){
    const active = new Set();
    for (const def of PASS_DEFS) if (state.passes[def.key]) active.add(def.key);
    for (const [name, keys] of Object.entries(PASS_PRESETS)){
      if (active.size !== keys.length) continue;
      if (keys.every(k => active.has(k))) {
        // Skip 'all' if 'deep' also matches — they're aliases.
        if (name === 'all') continue;
        return name;
      }
    }
    if (active.size === PASS_DEFS.length) return 'all';
    return null;
  }

  const CATEGORY_DEFS = [
    'bug', 'security', 'performance', 'correctness', 'maintainability',
    'readability', 'tests', 'docs', 'style', 'architecture',
    'accessibility', 'concurrency', 'data-integrity', 'api-contract', 'other',
  ];

  const persisted = (vscode.getState && vscode.getState()) || {};
  const defaultPasses = {};
  for (const p of PASS_DEFS) defaultPasses[p.key] = true;

  const state = {
    findings: [], filter: 'all', search: '', categoryFilters: new Set(),
    steps: new Map(),
    result: null,
    branches: [], remotes: [], defaultBase: null, currentBranch: null,
    selectedBase: null, selectedHead: null,
    showLocal: true, showRemote: true, branchSearch: '', fetching: false,
    abReqId: '', abResult: null,
    isRunning: false,
    passes: Object.assign({}, defaultPasses, persisted.passes || {}),
    leftCollapsed: !!persisted.leftCollapsed,
    leftWidth: clampLeftWidth(persisted.leftWidth) || 420,
    runningPass: null,
    // Most recent partial-state summary from the host. null = no paused review.
    partial: null,
  };

  function clampLeftWidth(n){
    const x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.min(720, Math.max(280, Math.round(x)));
  }
  function persist(){
    if (!vscode.setState) return;
    vscode.setState({
      passes: state.passes,
      leftCollapsed: state.leftCollapsed,
      leftWidth: state.leftWidth,
    });
  }

  function passLabelLong(pass){
    return tMsg('timeline.' + pass);
  }

  // ─── utilities ──────────────────────────────────────────────
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;') }
  function truncateForMeta(s){
    s = String(s||'').replace(/\s+/g, ' ').trim();
    return s.length > 60 ? s.slice(0,60)+'…' : s;
  }
  function fmtElapsed(ms){
    const s = Math.round(ms/1000);
    if (s < 60) return s+'s';
    const m = Math.floor(s/60), r = s%60;
    return m+'m '+r+'s';
  }
  function timeAgo(iso){
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const s = Math.floor((Date.now()-d.getTime())/1000);
    if (s < 60) return s+'s ago';
    if (s < 3600) return Math.floor(s/60)+'m ago';
    if (s < 86400) return Math.floor(s/3600)+'h ago';
    if (s < 86400*30) return Math.floor(s/86400)+'d ago';
    if (s < 86400*365) return Math.floor(s/(86400*30))+'mo ago';
    return Math.floor(s/(86400*365))+'y ago';
  }
  function pad2(n){ return n < 10 ? '0'+n : ''+n }
  function nowStamp(){
    const d = new Date();
    return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }

  // ─── branch picker ──────────────────────────────────────────
  function filterBranches(){
    const q = state.branchSearch.toLowerCase().trim();
    return state.branches.filter(b=>{
      if (b.isRemote && !state.showRemote) return false;
      if (!b.isRemote && !state.showLocal) return false;
      if (!q) return true;
      return [b.name,b.lastAuthor,b.lastSubject].some(s=>String(s||'').toLowerCase().includes(q));
    });
  }
  function renderBranchList(rootEl, role){
    rootEl.innerHTML='';
    const list = filterBranches();
    const selected = role==='base' ? state.selectedBase : state.selectedHead;
    if (list.length === 0){
      rootEl.innerHTML = '<div class="branch-empty">'+esc(tMsg('branch.noMatch'))+'</div>';
      return;
    }
    for (const b of list){
      const isSel = selected === b.name;
      const el = document.createElement('div');
      el.className = 'branch';
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', isSel ? 'true' : 'false');
      el.tabIndex = 0;
      el.dataset.name = b.name;
      const badges = [];
      if (b.isCurrent) badges.push('current');
      if (b.isRemote) badges.push(b.remote || 'remote');
      if (!b.isRemote && b.upstream) badges.push('→ '+b.upstream);
      el.innerHTML =
        '<div class="branch-name" title="'+escAttr(b.name)+'">'+ esc(b.name) +'</div>' +
        (badges.length ? '<div class="branch-badges">'+badges.map(x=>'<span class="badge">'+esc(x)+'</span>').join('')+'</div>' : '') +
        '<div class="branch-meta">'+ esc((b.lastSubject||'').slice(0,80)) + (b.lastAuthor?' · '+esc(b.lastAuthor):'') + (b.lastCommitISO?' · '+timeAgo(b.lastCommitISO):'') +'</div>';
      el.addEventListener('click', ()=>{ pickBranch(role, b.name) });
      el.addEventListener('keydown', (ev)=>{
        if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); pickBranch(role, b.name) }
      });
      rootEl.appendChild(el);
    }
  }
  function pickBranch(role, name){
    if (role==='base') state.selectedBase = name; else state.selectedHead = name;
    renderBranchPicker();
    requestAheadBehind();
  }
  function requestAheadBehind(){
    if (!state.selectedBase || !state.selectedHead){ state.abResult = null; renderAB(); return; }
    if (state.selectedBase === state.selectedHead){ state.abResult = null; renderAB(); return; }
    const reqId = String(Math.random());
    state.abReqId = reqId;
    vscode.postMessage({type:'aheadBehind', base: state.selectedBase, head: state.selectedHead, reqId});
  }
  function renderAB(){
    const pill = $('#ab-pill');
    if (!state.selectedBase || !state.selectedHead){ pill.textContent = ''; return; }
    if (state.selectedBase === state.selectedHead){ pill.innerHTML = '<span class="same">'+esc(tMsg('branch.sameBranch'))+'</span>'; return; }
    const r = state.abResult;
    if (!r){ pill.textContent = '…'; return; }
    pill.innerHTML = '<span class="ahead">'+esc(tMsg('branch.ahead', {n: r.ahead}))+'</span> · <span class="behind">'+esc(tMsg('branch.behind', {n: r.behind}))+'</span>';
  }
  function renderBranchPicker(){
    $('#base-current').textContent = state.defaultBase ? tMsg('branch.default', {name: state.defaultBase}) : '';
    $('#head-current').textContent = state.currentBranch ? tMsg('branch.current', {name: state.currentBranch}) : '';
    $('#branches-meta').textContent = state.remotes.length
      ? tMsg('branch.countWithRemotes', {count: state.branches.length, remotes: state.remotes.length})
      : tMsg('branch.count', {count: state.branches.length});
    renderBranchList($('#base-list'), 'base');
    renderBranchList($('#head-list'), 'head');
    const passActive = Object.values(state.passes).some(Boolean);
    const ok = !!state.selectedBase && !!state.selectedHead && state.selectedBase !== state.selectedHead && !state.isRunning && passActive;
    const startBtn = $('#btn-start');
    // While running, the same button doubles as Stop. Mutually-exclusive class
    // toggles keep the visual state in sync with the action it performs.
    startBtn.classList.toggle('btn--primary', !state.isRunning);
    startBtn.classList.toggle('btn--danger', state.isRunning);
    startBtn.setAttribute('aria-disabled', state.isRunning ? 'false' : (ok ? 'false' : 'true'));
    if (state.isRunning){
      startBtn.innerHTML = '<span aria-hidden="true">■</span> '+esc(tMsg('branch.stopReview').replace(/^.\s*/, ''));
      startBtn.setAttribute('aria-label', tMsg('branch.stopRunningAria'));
      startBtn.title = tMsg('branch.cancelInProgress');
    } else if (!passActive){
      startBtn.innerHTML = '<span aria-hidden="true">▶</span> '+esc(tMsg('branch.pickPassFirst').replace(/^.\s*/, ''));
      startBtn.setAttribute('aria-label', tMsg('branch.pickPassFirstAria'));
    } else if (state.selectedHead && state.selectedBase && state.selectedHead !== state.selectedBase){
      const tpl = tMsg('branch.reviewVs', {head: '__HEAD__', base: '__BASE__'});
      const html = '<span aria-hidden="true">▶</span> ' +
        esc(tpl.replace(/^.\s*/, ''))
          .replace('__HEAD__', '<span class="branch-ref" title="'+escAttr(state.selectedHead)+'">'+esc(state.selectedHead)+'</span>')
          .replace('__BASE__', '<span class="branch-ref" title="'+escAttr(state.selectedBase)+'">'+esc(state.selectedBase)+'</span>');
      startBtn.innerHTML = html;
      startBtn.setAttribute('aria-label', tMsg('branch.reviewVsAria', {head: state.selectedHead, base: state.selectedBase}));
    } else {
      startBtn.innerHTML = '<span aria-hidden="true">▶</span> '+esc(tMsg('branch.pickBaseHead').replace(/^.\s*/, ''));
      startBtn.setAttribute('aria-label', tMsg('branch.pickBaseHeadAria'));
    }
    renderAB();
    if (state.leftCollapsed) renderRail();
  }
  function applyBranches(payload){
    state.branches = payload.branches || [];
    state.remotes = payload.remotes || [];
    state.defaultBase = payload.defaultBase;
    state.currentBranch = payload.currentBranch;
    if (!state.selectedBase && state.defaultBase){
      const def = state.branches.find(b=>b.name===state.defaultBase) || state.branches.find(b=>b.name==='origin/'+state.defaultBase);
      if (def) state.selectedBase = def.name;
    }
    if (!state.selectedHead && state.currentBranch){
      const cur = state.branches.find(b=>b.name===state.currentBranch);
      if (cur) state.selectedHead = cur.name;
    }
    const errEl = $('#branch-error');
    if (payload.error){
      errEl.textContent = payload.error;
      errEl.removeAttribute('data-empty');
    } else {
      errEl.textContent = '';
      errEl.setAttribute('data-empty', '1');
    }
    renderBranchPicker();
    requestAheadBehind();
  }

  // ─── timeline ────────────────────────────────────────────────
  // Steps shown here are non-orchestrator-pass entries (context, diff) plus
  // each pass. Status drives the visuals and which action buttons we render:
  //   running        → spinner
  //   done           → check
  //   error          → warning + (if review stopped) inline Retry button
  //   awaitDecision  → warning + Retry/Skip/Stop buttons (orchestrator paused)
  //   skipped        → muted, strike-through + Retry button when review stopped
  function renderTimeline(){
    const root = $('#timeline'); root.innerHTML='';
    if (state.steps.size === 0){
      root.innerHTML = '<div class="timeline-empty">'+esc(tMsg('timeline.empty'))+'</div>';
      return;
    }
    const now = Date.now();
    for (const [pass, info] of state.steps){
      const div = document.createElement('div');
      div.className = 'step ' + info.status;
      div.setAttribute('role', 'listitem');
      const icon =
        info.status==='running' ? '◐'
        : info.status==='done' ? '✓'
        : info.status==='error' ? '⚠'
        : info.status==='awaitDecision' ? '⚠'
        : info.status==='skipped' ? '–'
        : '·';
      const label = passLabelLong(pass);
      let elapsed = '';
      if (info.startedAt){
        const end = info.endedAt || now;
        elapsed = fmtElapsed(end - info.startedAt);
      }
      const activity = info.lastActivity
        ? '<div class="activity" title="'+escAttr(info.lastActivity)+'">'+esc(info.lastActivity)+'</div>'
        : '';
      const actions = renderStepActions(pass, info);
      div.innerHTML =
        '<div class="ico" aria-hidden="true">'+ icon +'</div>' +
        '<div class="body">' +
          '<div class="label"><span>'+esc(label)+'</span><span class="elapsed">'+esc(elapsed)+'</span></div>' +
          '<div class="meta">'+esc(info.detail || (info.status==='running' ? tMsg('timeline.working') : ''))+'</div>' +
          activity +
          actions +
        '</div>';
      root.appendChild(div);
    }
    if (state.leftCollapsed) renderRail();
  }

  // Real pass names that can be retried/skipped/stopped. 'context' and 'diff'
  // are bootstrap stages, not Claude passes — they don't get action buttons.
  const ACTIONABLE_PASSES = new Set(['structural','explore','security','performance','accessibility','tests','gaps','permute','critique']);

  function renderResumeBanner(){
    const el = $('#resume-banner');
    if (!el) return;
    if (!state.partial || state.isRunning){
      el.removeAttribute('data-visible');
      return;
    }
    const p = state.partial;
    const remaining = totalPassCount() - p.completedPasses.length - p.skippedPasses.length;
    $('#resume-banner-title').textContent = tMsg('resume.title', {head: p.headBranch, base: p.baseBranch});
    const reason = p.pausedReason ? p.pausedReason : tMsg('resume.reasonDefault');
    const summary = tMsg('resume.summary', {
      completed: p.completedPasses.length,
      skipped: p.skippedPasses.length,
      pending: Math.max(0, remaining),
      findings: p.findingCount,
    });
    $('#resume-banner-detail').textContent = summary + ' — ' + reason;
    el.setAttribute('data-visible', '1');
  }

  function totalPassCount(){
    // Count active passes per the current opts.passes selection. We treat
    // anything the user toggled on as a "planned" pass for the % math.
    let n = 0;
    for (const k of Object.keys(state.passes)) if (state.passes[k]) n++;
    return n;
  }

  function renderStepActions(pass, info){
    if (!ACTIONABLE_PASSES.has(pass)) return '';
    if (info.status === 'awaitDecision'){
      // Orchestrator is parked waiting for our verdict.
      return ''
        + '<div class="actions" role="group">'
        +   '<button class="primary" type="button" data-decision="retry" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.retry'))+'</button>'
        +   '<button type="button" data-decision="skip" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.skip'))+'</button>'
        +   '<button class="danger" type="button" data-decision="stop" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.stop'))+'</button>'
        + '</div>';
    }
    // After the review halted, offer per-step Retry on anything that didn't
    // finish cleanly. Hidden while another review is running so we don't queue
    // a second job.
    if (!state.isRunning && state.partial && (info.status === 'error' || info.status === 'skipped')){
      return ''
        + '<div class="actions">'
        +   '<button class="primary" type="button" data-retry-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.retryPass'))+'</button>'
        + '</div>';
    }
    return '';
  }

  // ─── log ─────────────────────────────────────────────────────
  let liveLineCount = 0;
  function appendLive(level, text, passTag){
    const live = $('#live');
    if (live.classList.contains('empty')){ live.classList.remove('empty'); live.innerHTML='' }
    const cleanText = String(text==null?'':text).replace(/\s+$/, '');
    if (!cleanText) return;
    const div = document.createElement('div');
    div.className = 'line ' + (level || 'info');
    const passSpan = passTag ? '<span class="pass">['+esc(passTag)+']</span>' : '';
    div.innerHTML = '<span class="ts">'+nowStamp()+'</span>'+passSpan+esc(cleanText);
    live.appendChild(div);
    liveLineCount++;
    while (live.childElementCount > 600) live.removeChild(live.firstChild);
    $('#log-count').textContent = liveLineCount ? '('+liveLineCount+' lines)' : '';
    live.scrollTop = live.scrollHeight;
  }
  function clearLive(){
    const live = $('#live');
    live.classList.add('empty');
    live.innerHTML = esc(tMsg('log.cleared'));
    liveLineCount = 0;
    $('#log-count').textContent = '';
  }

  // ─── counters ───────────────────────────────────────────────
  function bumpCounter(){
    const counts = {critical:0, major:0, minor:0, nit:0, praise:0};
    for (const f of state.findings) if (counts[f.severity] != null) counts[f.severity]++;
    for (const k of Object.keys(counts)){
      const el = $('#c-'+k);
      if (el){
        el.textContent = counts[k];
        const parent = el.closest('.counter');
        if (parent) parent.setAttribute('data-active', counts[k] > 0 ? '1' : '0');
      }
    }
    if (state.leftCollapsed) renderRail();
  }

  // ─── category filter chips ───────────────────────────────────
  function categoryCounts(){
    const counts = {};
    for (const f of state.findings){
      if (f.dismissed) continue;
      const c = f.category || 'other';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }
  function renderCategoryChips(){
    const root = $('#cat-filters');
    if (!root) return;
    const counts = categoryCounts();
    const total = Object.values(counts).reduce((a,b)=>a+b,0);
    const present = CATEGORY_DEFS.filter(c => counts[c]).sort((a,b) => counts[b] - counts[a]);
    if (total === 0){
      // No findings yet — keep the row visible but empty/quiet
      root.innerHTML = '';
      return;
    }
    const cleanedFilters = new Set(Array.from(state.categoryFilters).filter(c => counts[c]));
    if (cleanedFilters.size !== state.categoryFilters.size){
      state.categoryFilters = cleanedFilters;
    }
    const html = ['<span class="filter-cat-label">Category</span>'];
    html.push('<button class="cat-chip" type="button" data-cat-all="1" aria-pressed="'+(state.categoryFilters.size===0?'true':'false')+'" title="Show all categories">all <span class="count">'+total+'</span></button>');
    for (const c of present){
      const pressed = state.categoryFilters.has(c);
      html.push('<button class="cat-chip" type="button" data-cat="'+escAttr(c)+'" aria-pressed="'+(pressed?'true':'false')+'" title="Toggle '+escAttr(c)+'">'+esc(c)+' <span class="count">'+counts[c]+'</span></button>');
    }
    root.innerHTML = html.join('');
  }

  // ─── findings ────────────────────────────────────────────────
  function renderFindings(){
    const root = $('#findings'); root.innerHTML = '';
    const q = state.search.toLowerCase().trim();
    const filtered = state.findings.filter(f=>{
      if (f.dismissed) return false;
      if (state.filter !== 'all' && f.severity !== state.filter) return false;
      if (state.categoryFilters.size && !state.categoryFilters.has(f.category || 'other')) return false;
      if (!q) return true;
      return [f.file,f.title,f.category,f.description].some(s=>String(s||'').toLowerCase().includes(q));
    });
    renderCategoryChips();
    const empty = $('#empty');
    if (filtered.length === 0){
      empty.hidden = false;
      empty.textContent = state.result
        ? (state.findings.length ? tMsg('panel.noMatch') : tMsg('panel.cleanReview'))
        : '';
      if (!state.result){
        empty.innerHTML = tMsg('panel.emptyState');
      }
      return;
    }
    empty.hidden = true;
    for (const f of filtered){
      root.appendChild(buildFindingCard(f));
    }
  }

  // Compute which language a finding's text is currently shown in.
  // Per-row displayLang (set via the in-card chip) wins; otherwise the
  // global LANG. Falls back to originalLang when no translation is cached yet.
  function effectiveFindingLang(f){
    const target = f.displayLang || LANG;
    const orig = f.originalLang || 'en';
    if (target === orig) return orig;
    if (f.translations && f.translations[target]) return target;
    return orig;
  }

  // Return the displayed string for one of a finding's translatable fields.
  function pickField(f, field){
    const target = f.displayLang || LANG;
    const orig = f.originalLang || 'en';
    if (target !== orig && f.translations && f.translations[target]) {
      const tr = f.translations[target];
      const v = tr[field];
      if (v !== undefined && v !== null) return v;
    }
    return f[field];
  }

  function buildFindingCard(f){
    const card = document.createElement('article');
    card.className = 'finding';
    card.dataset.id = f.id;
    card.dataset.severity = f.severity || 'minor';
    card.setAttribute('aria-expanded', 'false');
    const sev = f.severity || 'minor';
    const fix = f.suggestedFix;
    // Use translated field accessors so per-row chip and global toggle both work.
    const title = pickField(f, 'title') || '';
    const description = pickField(f, 'description') || '';
    const reasoning = pickField(f, 'reasoning') || '';
    const questionsRaised = pickField(f, 'questionsRaised') || [];
    const evidence = pickField(f, 'evidence') || [];
    const alternativesConsidered = pickField(f, 'alternativesConsidered') || [];
    // Translated fix fields when available; the code in suggestedFix.replacement
    // and structural fields like range/confidence are not translated.
    const fixTranslated = (() => {
      if (!fix) return null;
      const target = f.displayLang || LANG;
      const orig = f.originalLang || 'en';
      if (target !== orig && f.translations && f.translations[target] && f.translations[target].suggestedFix) {
        return f.translations[target].suggestedFix;
      }
      return { description: fix.description, replacement: fix.replacement };
    })();
    const showingLang = effectiveFindingLang(f);
    const otherLang = showingLang === 'es' ? 'en' : 'es';
    const otherLangLabel = tMsg('lang.' + otherLang);
    const otherLangFull = tMsg(otherLang === 'es' ? 'lang.spanishLong' : 'lang.englishLong');
    const isTranslating = !!f._translating;
    const locLabel = esc(f.file)+':'+f.range.startLine+(f.range.endLine!==f.range.startLine?'-'+f.range.endLine:'');
    card.innerHTML =
      '<div class="finding-head" role="button" tabindex="0" data-toggle="'+escAttr(f.id)+'" aria-controls="body-'+escAttr(f.id)+'" aria-label="'+escAttr(sev+': '+title)+'">' +
        '<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>' +
        '<span class="sev" data-sev="'+escAttr(sev)+'">'+esc(sev)+'</span>' +
        '<span class="cat">'+esc(f.category||'other')+'</span>' +
        '<span class="title">'+esc(title)+'</span>' +
        '<span class="loc" role="button" tabindex="0" data-open="'+escAttr(f.id)+'" aria-label="'+escAttr(tMsg('card.jumpTo', {loc: locLabel}))+'">'+locLabel+'</span>' +
        '<span class="conf">'+esc(f.confidence||'')+'</span>' +
        '<button class="lang-chip'+(isTranslating?' is-loading':'')+'" type="button" '+
          'data-act="translate" data-id="'+escAttr(f.id)+'" data-target="'+escAttr(otherLang)+'" '+
          'title="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'" '+
          'aria-label="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'">'+
          (isTranslating ? esc(tMsg('card.translating')) : esc(tMsg('lang.' + showingLang))) +
        '</button>' +
      '</div>' +
      '<div class="finding-body" id="body-'+escAttr(f.id)+'">' +
        '<div class="grid2">' +
          '<div class="col">' +
            '<h4><span aria-hidden="true">🔍</span> '+esc(tMsg('card.problem'))+'</h4>' +
            '<p>'+esc(description)+'</p>' +
            (reasoning ? '<h4><span aria-hidden="true">🧠</span> '+esc(tMsg('card.reasoning'))+'</h4><p>'+esc(reasoning)+'</p>' : '') +
            (questionsRaised && questionsRaised.length ? '<h4><span aria-hidden="true">❓</span> '+esc(tMsg('card.questions'))+'</h4><ul class="qa">'+questionsRaised.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul>' : '') +
            (evidence && evidence.length ? '<h4><span aria-hidden="true">📎</span> '+esc(tMsg('card.evidence'))+'</h4>'+evidence.map(e=>'<div class="evidence">'+esc(e)+'</div>').join('') : '') +
          '</div>' +
          '<div class="col">' +
            '<h4><span aria-hidden="true">🛠</span> '+esc(tMsg('card.solution'))+'</h4>' +
            (fix
              ? '<p>'+esc(fixTranslated.description||'')+'</p><pre class="fix">'+esc(fixTranslated.replacement||'')+'</pre><div class="fix-conf">'+esc(tMsg('card.fixConfidence', {level: fix.confidence||''}))+'</div>'
              : '<p style="color:var(--fg-subtle)">'+esc(tMsg('card.noAutoFix'))+'</p>') +
            (alternativesConsidered && alternativesConsidered.length ? '<h4><span aria-hidden="true">🔀</span> '+esc(tMsg('card.alternatives'))+'</h4><ul class="qa">'+alternativesConsidered.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>' : '') +
            (f.relatedFiles && f.relatedFiles.length ? '<h4><span aria-hidden="true">🔗</span> '+esc(tMsg('card.relatedFiles'))+'</h4><ul class="qa">'+f.relatedFiles.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>' : '') +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn btn--xs" type="button" data-act="open" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.jumpToCode'))+'</button>' +
          (fix ? '<button class="btn btn--xs" type="button" data-act="apply" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.applyFix'))+'</button>' : '') +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="ask" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.askFollowUp'))+'</button>' +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="dismiss" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.dismiss'))+'</button>' +
        '</div>' +
      '</div>';
    return card;
  }

  // Re-render a single finding card in place (for translation toggles).
  function rerenderFinding(id){
    const card = $('#findings').querySelector('[data-id="'+CSS.escape(id)+'"]');
    if (!card) return;
    const f = state.findings.find(x => x.id === id);
    if (!f) return;
    const wasExpanded = card.getAttribute('aria-expanded') === 'true';
    const replacement = buildFindingCard(f);
    if (wasExpanded) replacement.setAttribute('aria-expanded', 'true');
    card.parentNode.replaceChild(replacement, card);
  }

  // ─── delegated event handlers ────────────────────────────────
  // Note: we widen to Element (not HTMLElement) so clicks inside <svg> — like
  // the chevron used to expand a finding — still hit the .closest() lookups.
  // SVGElement extends Element but NOT HTMLElement, which would otherwise
  // make the chevron uniquely unclickable.
  document.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (!(t instanceof Element)) return;

    // Header EN/ES toggle — postMessage to host, which calls back via
    // panel.onLanguageChanged() with the new lang.
    const langBtn = t.closest('.lang-btn');
    if (langBtn instanceof HTMLElement && langBtn.dataset.lang){
      vscode.postMessage({type:'setLang', lang: langBtn.dataset.lang});
      ev.stopPropagation();
      return;
    }

    if (t instanceof HTMLElement && t.matches('.filter')){
      state.filter = t.dataset.f;
      $$('.filter').forEach(b => b.setAttribute('aria-pressed', b === t ? 'true' : 'false'));
      renderFindings();
      return;
    }
    const opener = t.closest('[data-open]');
    if (opener instanceof HTMLElement){
      vscode.postMessage({type:'open', id: opener.dataset.open});
      ev.stopPropagation();
      return;
    }
    const actEl = t.closest('[data-act]');
    if (actEl instanceof HTMLElement && actEl.dataset.id){
      const act = actEl.dataset.act;
      if (act === 'translate'){
        // Per-row language chip — request a translation if not cached, else
        // flip displayLang immediately and re-render this card alone.
        const id = actEl.dataset.id;
        const target = actEl.dataset.target;
        const f = state.findings.find(x => x.id === id);
        if (!f) { ev.stopPropagation(); return; }
        if ((f.originalLang || 'en') === target || (f.translations && f.translations[target])){
          f.displayLang = target;
          rerenderFinding(id);
        } else {
          f._translating = true;
          rerenderFinding(id);
          vscode.postMessage({type:'translateFinding', id, lang: target});
        }
        ev.stopPropagation();
        return;
      }
      const type = act === 'apply' ? 'applyFix' : act === 'ask' ? 'askFollowUp' : act === 'dismiss' ? 'dismiss' : 'open';
      vscode.postMessage({type, id: actEl.dataset.id});
      ev.stopPropagation();
      return;
    }
    const head = t.closest('.finding-head');
    if (head){
      const card = head.closest('.finding');
      const expanded = card && card.getAttribute('aria-expanded') === 'true';
      if (card) card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
  });

  document.addEventListener('keydown', (ev)=>{
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (t.matches('[data-open]')){
      ev.preventDefault();
      vscode.postMessage({type:'open', id: t.dataset.open});
      return;
    }
    if (t.matches('.finding-head')){
      ev.preventDefault();
      const card = t.closest('.finding');
      const expanded = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
  });

  // ─── passes (analysis aspects) selector ─────────────────────
  function renderPasses(){
    const root = $('#passes');
    if (!root) return;
    let active = 0;
    const groupsHtml = [];
    for (const family of FAMILY_ORDER){
      const inFamily = PASS_DEFS.filter(d => d.family === family);
      if (inFamily.length === 0) continue;
      const pills = [];
      for (const def of inFamily){
        const on = !!state.passes[def.key];
        if (on) active++;
        const conditional = def.conditional
          ? '<span class="pass-pill__cond" title="'+escAttr(tMsg('passes.conditional.'+def.conditional))+'">'+esc(tMsg('passes.conditionalShort'))+'</span>'
          : '';
        pills.push(
          '<label class="pass-pill" data-key="'+escAttr(def.key)+'">' +
            '<input type="checkbox" data-pass="'+escAttr(def.key)+'"'+(on?' checked':'')+' aria-describedby="pass-tip-'+escAttr(def.key)+'">' +
            '<span class="pass-pill__label">'+esc(passLabel(def.key))+'</span>' +
            conditional +
            '<span class="pass-tip" id="pass-tip-'+escAttr(def.key)+'" role="tooltip">' +
              '<span class="pass-tip__title">'+esc(passLabel(def.key))+'</span>' +
              '<span class="pass-tip__hint">'+esc(passHint(def.key))+'</span>' +
              '<span class="pass-tip__detail">'+esc(passDetail(def.key))+'</span>' +
            '</span>' +
          '</label>'
        );
      }
      groupsHtml.push(
        '<div class="pass-group" data-family="'+escAttr(family)+'">' +
          '<div class="pass-group__h">'+esc(familyLabel(family))+'</div>' +
          '<div class="pass-group__pills">'+pills.join('')+'</div>' +
        '</div>'
      );
    }
    root.innerHTML = groupsHtml.join('');
    const total = PASS_DEFS.length;
    $('#passes-count').textContent = active === total ? '('+tMsg('panel.selectAll').toLowerCase()+')' : '('+active+'/'+total+')';
    const est = $('#passes-estimate');
    if (est) est.textContent = active === 0 ? '' : formatEstimate();
    // Highlight matching preset (if any).
    const activePreset = activePresetName();
    for (const btn of document.querySelectorAll('.preset')){
      btn.setAttribute('aria-pressed', btn.dataset.preset === activePreset ? 'true' : 'false');
    }
    syncStartBtn();
  }
  function applyPreset(name){
    const keys = PASS_PRESETS[name];
    if (!keys) return;
    const setKeys = new Set(keys);
    for (const def of PASS_DEFS) state.passes[def.key] = setKeys.has(def.key);
    renderPasses();
    persist();
  }
  function syncStartBtn(){
    // While running the button is a Stop button — always enabled. Otherwise it
    // mirrors renderBranchPicker's enable conditions.
    if (state.isRunning){
      // Delegate the full styling refresh to renderBranchPicker, which handles
      // the Stop variant. We just make sure nothing here re-disables it.
      const b = $('#btn-start'); if (b) b.setAttribute('aria-disabled', 'false');
      return;
    }
    const passActive = Object.values(state.passes).some(Boolean);
    const ok = !!state.selectedBase && !!state.selectedHead
      && state.selectedBase !== state.selectedHead
      && passActive;
    const startBtn = $('#btn-start');
    if (!startBtn) return;
    startBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    if (!passActive){
      startBtn.title = tMsg('branch.pickPassTitle');
    } else {
      startBtn.removeAttribute('title');
    }
  }

  // ─── collapse / expand left pane ────────────────────────────
  function applyCollapsed(){
    const main = $('#main');
    if (state.leftCollapsed){
      main.setAttribute('data-collapsed', '1');
      $('#left-rail').setAttribute('aria-hidden', 'false');
    } else {
      main.removeAttribute('data-collapsed');
      $('#left-rail').setAttribute('aria-hidden', 'true');
    }
    $('#collapse-icon').textContent = state.leftCollapsed ? '›' : '‹';
    const btn = $('#btn-collapse');
    btn.setAttribute('aria-label', state.leftCollapsed ? 'Expand panel' : 'Collapse panel');
    btn.title = state.leftCollapsed ? 'Expand panel (⌘\\\\)' : 'Collapse panel (⌘\\\\)';
    if (state.leftCollapsed) renderRail();
  }
  function setLeftCollapsed(v){
    state.leftCollapsed = !!v;
    applyCollapsed();
    persist();
  }

  function applyLeftWidth(){
    document.documentElement.style.setProperty('--left-w', state.leftWidth + 'px');
    const gutter = $('#gutter');
    if (gutter) gutter.setAttribute('aria-valuenow', String(state.leftWidth));
  }
  function setLeftWidth(px){
    state.leftWidth = clampLeftWidth(px);
    applyLeftWidth();
  }

  // Drag-resize the gutter
  (function setupGutter(){
    const gutter = $('#gutter');
    const main = $('#main');
    if (!gutter || !main) return;
    let dragging = false;
    let startX = 0;
    let startW = state.leftWidth;
    function onMove(ev){
      if (!dragging) return;
      const dx = ev.clientX - startX;
      setLeftWidth(startW + dx);
    }
    function onUp(){
      if (!dragging) return;
      dragging = false;
      gutter.removeAttribute('data-active');
      main.removeAttribute('data-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      persist();
    }
    gutter.addEventListener('mousedown', (ev) => {
      if (state.leftCollapsed) return; // ignore while collapsed
      ev.preventDefault();
      dragging = true;
      startX = ev.clientX;
      startW = state.leftWidth;
      gutter.setAttribute('data-active', '1');
      main.setAttribute('data-resizing', '1');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    gutter.addEventListener('dblclick', () => {
      if (state.leftCollapsed) return;
      setLeftWidth(420);
      persist();
    });
    gutter.addEventListener('keydown', (ev) => {
      if (state.leftCollapsed) return;
      const step = ev.shiftKey ? 32 : 8;
      if (ev.key === 'ArrowLeft'){ setLeftWidth(state.leftWidth - step); persist(); ev.preventDefault() }
      else if (ev.key === 'ArrowRight'){ setLeftWidth(state.leftWidth + step); persist(); ev.preventDefault() }
      else if (ev.key === 'Home'){ setLeftWidth(280); persist(); ev.preventDefault() }
      else if (ev.key === 'End'){ setLeftWidth(720); persist(); ev.preventDefault() }
    });
  })();

  // ─── rail summary (when collapsed) ──────────────────────────
  function renderRail(){
    const dot = $('#rail-dot');
    const passWrap = $('#rail-pass');
    const branchesEl = $('#rail-branches');
    if (!dot) return;
    let state2 = 'idle';
    if (state.isRunning) state2 = 'running';
    else if (state.result){
      const v = state.result.summary && state.result.summary.overallVerdict;
      state2 = (v === 'block' || v === 'needs-changes') ? 'error' : 'done';
    }
    dot.dataset.state = state2;
    let branchesText = '';
    if (state.selectedHead && state.selectedBase){
      branchesText = state.selectedHead + ' ← ' + state.selectedBase;
    } else if (state.result){
      branchesText = (state.result.summary.branch||'') + ' ← ' + (state.result.summary.baseBranch||'');
    }
    branchesEl.textContent = branchesText;
    branchesEl.title = branchesText;
    // Current pass
    let passText = '';
    let running = null;
    for (const [k, v] of state.steps){
      if (v && v.status === 'running'){ running = { k, v }; break }
    }
    if (running) passText = passLabelLong(running.k);
    else if (!state.isRunning && state.result){
      const c = state.result.findings ? state.result.findings.filter(f=>!f.dismissed).length : 0;
      passText = c + ' findings';
    } else if (!state.isRunning){
      passText = 'idle';
    } else {
      passText = 'starting…';
    }
    passWrap.textContent = passText;
    passWrap.title = passText;
    // Counters
    const counts = {critical:0, major:0, minor:0, nit:0};
    for (const f of state.findings) if (!f.dismissed && counts[f.severity] != null) counts[f.severity]++;
    $('#rail-c-critical').textContent = counts.critical;
    $('#rail-c-major').textContent    = counts.major;
    $('#rail-c-minor').textContent    = counts.minor;
    $('#rail-c-nit').textContent      = counts.nit;
  }

  // Bind events for passes, collapse, category filters
  $('#passes').addEventListener('change', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    const key = t.dataset.pass;
    if (!key || !PASS_KEY_SET.has(key)) return;
    state.passes[key] = t.checked;
    renderPasses();
    persist();
  });
  $('#btn-passes-none').addEventListener('click', () => {
    for (const def of PASS_DEFS) state.passes[def.key] = false;
    renderPasses();
    persist();
  });
  $('#presets').addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest('[data-preset]');
    if (!btn) return;
    ev.preventDefault();
    applyPreset(btn.dataset.preset);
  });

  $('#btn-collapse').addEventListener('click', () => setLeftCollapsed(!state.leftCollapsed));

  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === '\\\\'){
      ev.preventDefault();
      setLeftCollapsed(!state.leftCollapsed);
    }
  });

  $('#cat-filters').addEventListener('click', (ev) => {
    const t = ev.target instanceof HTMLElement ? ev.target.closest('[data-cat],[data-cat-all]') : null;
    if (!t) return;
    if (t.hasAttribute('data-cat-all')){
      state.categoryFilters.clear();
    } else {
      const c = t.getAttribute('data-cat');
      if (state.categoryFilters.has(c)) state.categoryFilters.delete(c);
      else state.categoryFilters.add(c);
    }
    renderFindings();
  });

  $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderFindings() });
  $('#btn-export').addEventListener('click', () => vscode.postMessage({type:'export'}));

  $('#branch-filter').addEventListener('input', (e) => { state.branchSearch = e.target.value; renderBranchPicker() });
  $('#show-local').addEventListener('change', (e) => { state.showLocal = e.target.checked; renderBranchPicker() });
  $('#show-remote').addEventListener('change', (e) => { state.showRemote = e.target.checked; renderBranchPicker() });
  $('#btn-fetch').addEventListener('click', () => {
    if (state.fetching) return;
    state.fetching = true;
    const b = $('#btn-fetch'); b.setAttribute('aria-disabled','true'); b.innerHTML = '<span aria-hidden="true">⟳</span> '+esc(tMsg('panel.fetching'));
    vscode.postMessage({type:'fetchBranches', prune:true});
  });
  $('#btn-start').addEventListener('click', () => {
    if (state.isRunning){
      // Acts as Stop while running. Disable immediately so it can't be
      // double-clicked while the cancellation propagates.
      const b = $('#btn-start');
      b.setAttribute('aria-disabled', 'true');
      b.innerHTML = '<span aria-hidden="true">■</span> '+esc(tMsg('panel.stopping'));
      vscode.postMessage({type:'cancelReview'});
      return;
    }
    if ($('#btn-start').getAttribute('aria-disabled') === 'true') return;
    vscode.postMessage({
      type:'startReview',
      base: state.selectedBase,
      head: state.selectedHead,
      passes: Object.assign({}, state.passes),
    });
  });
  $('#btn-resume').addEventListener('click', () => {
    if (!state.partial || state.isRunning) return;
    vscode.postMessage({type:'resumeReview'});
  });
  $('#btn-discard-partial').addEventListener('click', () => {
    if (!state.partial || state.isRunning) return;
    vscode.postMessage({type:'discardPartial'});
  });
  // Timeline buttons are rendered dynamically, so we delegate to the container.
  $('#timeline').addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const decisionBtn = t.closest('button[data-decision]');
    if (decisionBtn){
      const pass = decisionBtn.getAttribute('data-pass');
      const decision = decisionBtn.getAttribute('data-decision');
      if (pass && decision){
        // Disable the whole action row immediately so the user can't double-click
        // a different decision while the message is in flight.
        const row = decisionBtn.closest('.actions');
        if (row) row.querySelectorAll('button').forEach((b) => b.setAttribute('disabled','true'));
        vscode.postMessage({type:'passDecision', pass, decision});
      }
      return;
    }
    const retryBtn = t.closest('button[data-retry-pass]');
    if (retryBtn){
      const pass = retryBtn.getAttribute('data-retry-pass');
      if (pass){
        retryBtn.setAttribute('disabled','true');
        retryBtn.textContent = '↻ Retrying…';
        vscode.postMessage({type:'retryPass', pass});
      }
    }
  });
  $('#btn-clear-log').addEventListener('click', clearLive);
  $('#btn-copy-log').addEventListener('click', () => {
    const live = $('#live');
    const text = live.innerText || live.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const b = $('#btn-copy-log'); const orig = b.textContent;
      b.textContent = '✓ Copied'; setTimeout(() => b.textContent = orig, 1200);
    }).catch(() => {});
  });

  setInterval(() => { if (state.isRunning) renderTimeline() }, 1000);

  // ─── event stream ────────────────────────────────────────────
  function applyEvent(e){
    if (e.kind === 'start'){
      const pill = $('#branches');
      pill.setAttribute('data-visible', '1');
      pill.textContent = e.headBranch + ' ← ' + e.baseBranch;
      $('#verdict').dataset.v = 'running'; $('#verdict').textContent = 'RUNNING';
      state.findings = []; state.steps.clear(); state.result = null; state.isRunning = true;
      $('#exec').hidden = true; $('#bullets').hidden = true;
      bumpCounter(); renderFindings(); renderTimeline(); renderBranchPicker(); renderResumeBanner();
      appendLive('info', tMsg('log.reviewStarted', {head: e.headBranch, base: e.baseBranch}), 'review');
    } else if (e.kind === 'context'){
      state.steps.set('context', { status:'done', startedAt: e.at, endedAt: e.at, detail: (e.languages.join(', ')||'no lang') + (e.frameworks.length ? ' · '+e.frameworks.join(', ') : '') });
      renderTimeline();
      appendLive('info', tMsg('log.detected', {value: e.languages.join(', ')}), 'context');
    } else if (e.kind === 'diff'){
      state.steps.set('diff', { status:'done', startedAt: e.at, endedAt: e.at, detail: e.filesChanged+' files · +'+e.additions+' / -'+e.deletions + (e.truncated?' · TRUNCATED':'') });
      renderTimeline();
      appendLive('info', e.filesChanged+' files changed (+'+e.additions+'/-'+e.deletions+')'+(e.truncated?' [diff truncated]':''), 'diff');
    } else if (e.kind === 'passStart'){
      state.steps.set(e.pass, { status:'running', startedAt: e.at, detail: 'sending prompt to Claude…', lastActivity: '' });
      renderTimeline();
      appendLive('info', 'started', e.pass);
    } else if (e.kind === 'passOutput'){
      const step = state.steps.get(e.pass);
      const trimmed = String(e.chunk||'').trim();
      if (step){
        if (trimmed){
          step.lastActivity = trimmed.slice(0, 120);
          step.detail = 'streaming · ' + truncateForMeta(trimmed);
        }
        renderTimeline();
      }
      if (trimmed) appendLive('info', trimmed, e.pass);
    } else if (e.kind === 'passDone'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'done', endedAt: e.at, detail: e.findingCount+' findings · '+(Math.round(e.durationMs/100)/10)+'s' });
      renderTimeline();
      appendLive('info', 'done · '+e.findingCount+' findings in '+(Math.round(e.durationMs/100)/10)+'s', e.pass);
    } else if (e.kind === 'passError'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'error', endedAt: e.at, detail: e.error });
      renderTimeline();
      appendLive('error', e.error, e.pass);
    } else if (e.kind === 'passAwaitDecision'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'awaitDecision', endedAt: e.at, detail: tMsg('timeline.failedDecision', {error: e.error}) });
      renderTimeline();
      appendLive('warn', 'awaiting decision: '+e.error, e.pass);
    } else if (e.kind === 'passDecisionMade'){
      const existing = state.steps.get(e.pass) || {};
      // The next event (passStart for retry, paused for stop, nothing for skip)
      // will update status. For 'skip' specifically, transition here so the
      // step doesn't linger in awaitDecision while no further event arrives.
      if (e.decision === 'skip'){
        state.steps.set(e.pass, { ...existing, status:'skipped', endedAt: e.at, detail: tMsg('timeline.skipped') });
      } else if (e.decision === 'stop'){
        state.steps.set(e.pass, { ...existing, status:'error', endedAt: e.at, detail: existing.detail || tMsg('timeline.failed') });
      }
      renderTimeline();
      appendLive('info', 'decision: '+e.decision, e.pass);
    } else if (e.kind === 'paused'){
      state.isRunning = false;
      $('#verdict').dataset.v = 'needs-changes'; $('#verdict').textContent = 'PAUSED';
      renderBranchPicker();
      renderTimeline();
      renderResumeBanner();
      appendLive('warn', tMsg('log.reviewPaused', {reason: e.reason}), 'review');
    } else if (e.kind === 'retryPassStart'){
      // Reserved for future use — the orchestrator currently fires passStart
      // for retries too, which is enough for the timeline.
    } else if (e.kind === 'findingAdded'){
      state.findings.push(e.finding); bumpCounter(); renderFindings();
      appendLive('info', '+ ['+(e.finding.severity||'?')+'] '+e.finding.title+' @ '+e.finding.file+':'+e.finding.range.startLine, 'finding');
    } else if (e.kind === 'log'){
      appendLive(e.level, e.message);
    } else if (e.kind === 'done'){
      $('#verdict').dataset.v = e.verdict; $('#verdict').textContent = (e.verdict||'').toUpperCase();
      state.isRunning = false; renderBranchPicker(); renderResumeBanner();
    } else if (e.kind === 'cancelled'){
      $('#verdict').dataset.v = 'needs-changes'; $('#verdict').textContent = 'CANCELLED';
      state.isRunning = false; renderBranchPicker(); renderResumeBanner();
    }
  }

  function applyResult(r){
    state.result = r;
    if (!r){
      $('#exec').hidden = true; $('#bullets').hidden = true;
      state.findings = []; bumpCounter(); renderFindings(); return;
    }
    state.findings = r.findings || [];
    bumpCounter(); renderFindings();
    $('#exec').hidden = false;
    $('#exec-text').textContent = r.summary.executiveSummary || '';
    $('#bullets').hidden = false;
    $('#concerns').innerHTML = (r.summary.topConcerns||[]).map(c => '<li>'+esc(c)+'</li>').join('') || '<li style="color:var(--fg-subtle)">none</li>';
    $('#strengths').innerHTML = (r.summary.strengths||[]).map(c => '<li>'+esc(c)+'</li>').join('') || '<li style="color:var(--fg-subtle)">none</li>';
    $('#verdict').dataset.v = r.summary.overallVerdict || 'approve-with-comments';
    $('#verdict').textContent = (r.summary.overallVerdict || '').toUpperCase();
    const pill = $('#branches');
    pill.setAttribute('data-visible', '1');
    pill.textContent = r.summary.branch + ' ← ' + r.summary.baseBranch;
  }

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'event') applyEvent(m.event);
    else if (m.type === 'result') applyResult(m.result);
    else if (m.type === 'branches') applyBranches(m);
    else if (m.type === 'fetchStart'){
      state.fetching = true;
      const b = $('#btn-fetch'); b.setAttribute('aria-disabled','true'); b.innerHTML = '<span aria-hidden="true">⟳</span> Fetching…';
      const errEl = $('#branch-error'); errEl.textContent = ''; errEl.setAttribute('data-empty', '1');
    } else if (m.type === 'fetchDone'){
      state.fetching = false;
      const b = $('#btn-fetch'); b.removeAttribute('aria-disabled'); b.innerHTML = '<span aria-hidden="true">⟳</span> Fetch';
      appendLive('info', '[fetch] ' + (m.output||'').trim());
    } else if (m.type === 'fetchError'){
      state.fetching = false;
      const b = $('#btn-fetch'); b.removeAttribute('aria-disabled'); b.innerHTML = '<span aria-hidden="true">⟳</span> '+esc(tMsg('panel.fetch'));
      const errEl = $('#branch-error'); errEl.textContent = tMsg('log.fetchFailed', {message: m.message}); errEl.removeAttribute('data-empty');
    } else if (m.type === 'fetchPrompt'){
      const b = $('#btn-fetch'); b.innerHTML = '<span aria-hidden="true">🔐</span> ' + esc(m.message.replace(/\.{3,}$/,'…'));
      appendLive('warn', '[fetch] '+m.message);
    } else if (m.type === 'branchError'){
      const errEl = $('#branch-error');
      if (m.message){ errEl.textContent = m.message; errEl.removeAttribute('data-empty') }
      else { errEl.textContent = ''; errEl.setAttribute('data-empty', '1') }
    } else if (m.type === 'aheadBehind'){
      if (m.reqId !== state.abReqId) return;
      state.abResult = m.result; renderAB();
    } else if (m.type === 'partialSummary'){
      state.partial = m.summary || null;
      renderResumeBanner();
      // Per-step Retry visibility depends on partial existing.
      renderTimeline();
    } else if (m.type === 'findingTranslationPending'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){ f._translating = true; rerenderFinding(m.id); }
    } else if (m.type === 'findingTranslated'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){
        f.translations = Object.assign({}, f.translations || {}, { [m.lang]: m.fields });
        f.displayLang = m.lang;
        delete f._translating;
        rerenderFinding(m.id);
      }
    } else if (m.type === 'findingTranslationError'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){ delete f._translating; rerenderFinding(m.id); }
    }
  });

  // Initial paint so empty states render before any events arrive.
  applyLeftWidth();
  applyCollapsed();
  renderPasses();
  renderTimeline();
  renderFindings();
  bumpCounter();

  vscode.postMessage({type:'ready'});
})();
</script>
</body>
</html>`;
  }
}

const PASS_KEYS = [
  'structural', 'explore', 'security', 'performance',
  'accessibility', 'tests', 'gaps', 'permute', 'critique',
] as const;

function sanitizePasses(raw: any): Partial<PassConfig> {
  const out: Partial<PassConfig> = {};
  for (const k of PASS_KEYS) {
    if (typeof raw[k] === 'boolean') (out as any)[k] = raw[k];
  }
  return out;
}
