import * as vscode from 'vscode';
import { ReviewResult } from '../types';
import { Lang, t } from '../i18n';
import { PartialReviewSummary } from './reviewPanel';
import { PassName, ReviewEvent, ReviewEventBus } from '../core/events';

/**
 * Sidebar dashboard. Responsibilities:
 *   1. Show an at-a-glance status of the workspace (current branch, base,
 *      whether a review is running, paused, or finished).
 *   2. Provide the fastest path to a review: a single ▶ button that runs
 *      against the detected base/head — no need to open the big panel.
 *   3. Surface paused-review state and history (last 3 reviews per branch).
 *
 * The big interactive ReviewPanel is still the home for branch picking,
 * timeline, and findings cards; this view is the "always visible" companion.
 */

export interface SummaryDeps {
  getLang: () => Lang;
  getCurrentBranch: () => Promise<string | null>;
  getDefaultBaseBranch: () => Promise<string | null>;
  getPartialSummary: () => PartialReviewSummary | null;
  startReviewCurrentBranch: () => void;
  startReviewInteractive: () => void;
  openPanel: () => void;
  cancelReview: () => void;
  resumeReview: () => void;
  discardPartial: () => void;
  exportReport: () => void;
  recallReview: (id: string) => void;
  getHistory: () => HistoryEntry[];
  isReviewRunning: () => boolean;
}

export interface HistoryEntry {
  id: string;
  baseBranch: string;
  headBranch: string;
  verdict: string;
  findingCount: number;
  critical: number;
  major: number;
  finishedAt: number;
  durationMs: number;
}

type RunState =
  | { kind: 'idle' }
  | {
      kind: 'running';
      currentPass: PassName | null;
      completedPasses: Set<PassName>;
      findingCount: number;
      startedAt: number;
      head: string;
      base: string;
    }
  | { kind: 'failed'; pass: PassName | null }
  | { kind: 'done'; verdict: string; findingCount: number }
  | { kind: 'cancelled' };

const TRACKED_PASSES: PassName[] = [
  'context',
  'diff',
  'structural',
  'explore',
  'security',
  'performance',
  'accessibility',
  'tests',
  'gaps',
  'permute',
  'critique',
  'summary',
];

export class SummaryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeReviewer.summary';
  private view?: vscode.WebviewView;
  private result: ReviewResult | null = null;
  private partial: PartialReviewSummary | null = null;
  private branchInfo: { current: string | null; defaultBase: string | null } = {
    current: null,
    defaultBase: null,
  };
  private runState: RunState = { kind: 'idle' };
  private tickTimer?: NodeJS.Timeout;
  private busSub: vscode.Disposable;

  constructor(
    private readonly deps: SummaryDeps,
    bus: ReviewEventBus,
  ) {
    this.busSub = bus.onEvent((e) => this.handleEvent(e));
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.render();
    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    // Refresh branch info every time the view becomes visible — branches can
    // change between sessions and we don't want stale data after a checkout.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) void this.refreshBranchInfo();
    });
    void this.refreshBranchInfo();
  }

  dispose() {
    this.stopTick();
    this.busSub.dispose();
  }

  setResult(result: ReviewResult | null) {
    this.result = result;
    if (result) {
      // A fresh result implicitly clears the transient run state — the next
      // render should show the result, not "still running".
      if (this.runState.kind === 'running') {
        this.runState = { kind: 'done', verdict: result.summary.overallVerdict, findingCount: result.findings.length };
        this.stopTick();
      }
    }
    this.rerender();
  }

  setPartialSummary(summary: PartialReviewSummary | null) {
    this.partial = summary;
    this.rerender();
  }

  onLanguageChanged() {
    this.rerender();
  }

  /** Called by extension when branches may have changed (workspace open, etc). */
  async refreshBranchInfo() {
    try {
      const [current, defaultBase] = await Promise.all([
        this.deps.getCurrentBranch(),
        this.deps.getDefaultBaseBranch(),
      ]);
      this.branchInfo = { current, defaultBase };
    } catch {
      this.branchInfo = { current: null, defaultBase: null };
    }
    this.rerender();
  }

  private handleMessage(msg: { type?: string; id?: string } | null) {
    if (!msg?.type) return;
    switch (msg.type) {
      case 'openPanel':
        this.deps.openPanel();
        break;
      case 'reviewNow':
        this.deps.startReviewCurrentBranch();
        break;
      case 'configureReview':
        this.deps.startReviewInteractive();
        break;
      case 'cancel':
        this.deps.cancelReview();
        break;
      case 'resume':
        this.deps.resumeReview();
        break;
      case 'discardPartial':
        this.deps.discardPartial();
        break;
      case 'export':
        this.deps.exportReport();
        break;
      case 'recall':
        if (msg.id) this.deps.recallReview(msg.id);
        break;
      case 'refreshBranches':
        void this.refreshBranchInfo();
        break;
    }
  }

  private handleEvent(e: ReviewEvent) {
    switch (e.kind) {
      case 'start':
        this.runState = {
          kind: 'running',
          currentPass: null,
          completedPasses: new Set(),
          findingCount: 0,
          startedAt: e.at,
          head: e.headBranch,
          base: e.baseBranch,
        };
        this.startTick();
        break;
      case 'context':
        if (this.runState.kind === 'running') this.runState.completedPasses.add('context');
        break;
      case 'diff':
        if (this.runState.kind === 'running') this.runState.completedPasses.add('diff');
        break;
      case 'passStart':
        if (this.runState.kind === 'running') this.runState.currentPass = e.pass;
        break;
      case 'passDone':
        if (this.runState.kind === 'running') {
          this.runState.completedPasses.add(e.pass);
          if (this.runState.currentPass === e.pass) this.runState.currentPass = null;
        }
        break;
      case 'passError':
        if (this.runState.kind === 'running') {
          this.runState = { kind: 'failed', pass: e.pass };
          this.stopTick();
        }
        break;
      case 'findingAdded':
        if (this.runState.kind === 'running') this.runState.findingCount++;
        break;
      case 'done':
        this.runState = { kind: 'done', verdict: e.verdict, findingCount: e.findingCount };
        this.stopTick();
        break;
      case 'cancelled':
        this.runState = { kind: 'cancelled' };
        this.stopTick();
        break;
      case 'paused':
        // The partial summary will be pushed in via setPartialSummary; nothing
        // extra to do here, just stop ticking.
        this.stopTick();
        break;
    }
    this.rerender();
  }

  private startTick() {
    this.stopTick();
    // 1s tick to keep "elapsed: 42s" fresh during a running review.
    this.tickTimer = setInterval(() => this.rerender(), 1000);
  }

  private stopTick() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  private rerender() {
    if (this.view) this.view.webview.html = this.render();
  }

  // ─── render ───────────────────────────────────────────────────────────

  private render(): string {
    const nonce = String(Math.random()).slice(2);
    const lang = this.deps.getLang();
    const body = [
      this.renderBrand(lang),
      this.renderRunningOrFailed(lang),
      this.renderPausedBanner(lang),
      this.renderQuickActions(lang),
      this.result ? this.renderLastResult(lang) : '',
      this.renderHistory(lang),
      this.renderFooter(lang),
    ].filter(Boolean).join('\n');
    return wrap(nonce, body);
  }

  private renderBrand(lang: Lang): string {
    return /* html */ `
      <header class="brand">
        <span class="brand__dot" aria-hidden="true"></span>
        <span class="brand__name">${esc(t('summary.brand', lang))}</span>
        <span class="brand__pill" data-state="${this.brandStateAttr()}">${esc(this.brandStateLabel(lang))}</span>
      </header>`;
  }

  private brandStateAttr(): string {
    if (this.runState.kind === 'running') return 'running';
    if (this.runState.kind === 'failed') return 'failed';
    if (this.partial) return 'paused';
    if (this.result) return 'done';
    return 'idle';
  }

  private brandStateLabel(lang: Lang): string {
    switch (this.brandStateAttr()) {
      case 'running': return t('summary.stateRunning', lang);
      case 'failed':  return t('summary.stateFailed', lang);
      case 'paused':  return t('summary.statePaused', lang);
      case 'done':    return t('summary.stateDone', lang);
      default:        return t('summary.stateIdle', lang);
    }
  }

  private renderRunningOrFailed(lang: Lang): string {
    if (this.runState.kind === 'running') {
      const total = TRACKED_PASSES.length;
      const completed = this.runState.completedPasses.size;
      const pct = Math.min(100, Math.round((completed / total) * 100));
      const elapsed = Math.round((Date.now() - this.runState.startedAt) / 1000);
      const currentLabel = this.runState.currentPass
        ? t(`timeline.${this.runState.currentPass}` as any, lang)
        : t('summary.preparing', lang);
      return /* html */ `
        <section class="card card--live" aria-live="polite">
          <div class="card__head">
            <span class="card__title">${esc(t('summary.reviewing', lang, { head: this.runState.head, base: this.runState.base }))}</span>
            <button class="btn btn--danger btn--sm" data-act="cancel" type="button">
              ${esc(t('summary.cancel', lang))}
            </button>
          </div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <div class="progress__bar" style="width:${pct}%"></div>
          </div>
          <div class="card__meta">
            <span class="meta-pass">${esc(currentLabel)}</span>
            <span class="meta-sep">·</span>
            <span>${esc(t('summary.progressPasses', lang, { done: completed, total }))}</span>
            <span class="meta-sep">·</span>
            <span>${esc(t('summary.findingsLive', lang, { count: this.runState.findingCount }))}</span>
            <span class="meta-sep">·</span>
            <span class="meta-time">${esc(t('summary.seconds', lang, { seconds: elapsed }))}</span>
          </div>
        </section>`;
    }
    if (this.runState.kind === 'failed') {
      return /* html */ `
        <section class="card card--failed">
          <div class="card__head"><span class="card__title">${esc(t('summary.passFailed', lang, { pass: this.runState.pass ?? '?' }))}</span></div>
          <p class="card__body">${esc(t('summary.passFailedHint', lang))}</p>
        </section>`;
    }
    return '';
  }

  private renderPausedBanner(lang: Lang): string {
    if (!this.partial) return '';
    const total = TRACKED_PASSES.length;
    const completed = this.partial.completedPasses.length;
    const skipped = this.partial.skippedPasses.length;
    const pending = Math.max(0, total - completed - skipped);
    return /* html */ `
      <section class="card card--paused">
        <div class="card__head">
          <span class="card__title">${esc(t('summary.pausedTitle', lang, { head: this.partial.headBranch, base: this.partial.baseBranch }))}</span>
        </div>
        <p class="card__body card__body--muted">${esc(t('summary.pausedSummary', lang, {
          completed,
          skipped,
          pending,
          findings: this.partial.findingCount,
        }))}</p>
        <div class="card__actions">
          <button class="btn btn--primary btn--sm" data-act="resume" type="button">
            ${esc(t('summary.resume', lang))}
          </button>
          <button class="btn btn--ghost btn--sm" data-act="discardPartial" type="button">
            ${esc(t('summary.discard', lang))}
          </button>
        </div>
      </section>`;
  }

  private renderQuickActions(lang: Lang): string {
    if (this.runState.kind === 'running') return '';
    const head = this.branchInfo.current ?? '—';
    const base = this.branchInfo.defaultBase ?? '—';
    const canRunDirect = head !== '—' && base !== '—' && head !== base;
    const reviewBtn = canRunDirect
      ? /* html */ `<button class="btn btn--primary btn--sm" data-act="reviewNow" type="button" title="${esc(t('summary.reviewNowTitle', lang, { head, base }))}">
          <span aria-hidden="true">▶</span> ${esc(t('summary.reviewNow', lang, { head, base }))}
        </button>`
      : /* html */ `<button class="btn btn--primary btn--sm" data-act="configureReview" type="button">
          <span aria-hidden="true">▶</span> ${esc(t('summary.configureReview', lang))}
        </button>`;
    return /* html */ `
      <section class="card card--actions">
        <div class="branch-row" title="${esc(t('summary.branchRowTitle', lang))}">
          <span class="branch-row__label">${esc(t('summary.branchLabel', lang))}</span>
          <code class="branch-row__name">${esc(head)}</code>
          <span class="branch-row__vs">${esc(t('summary.vs', lang))}</span>
          <code class="branch-row__name">${esc(base)}</code>
        </div>
        <div class="card__actions">
          ${reviewBtn}
          <button class="btn btn--ghost btn--sm" data-act="openPanel" type="button">
            ${esc(t('summary.openPanel', lang))}
          </button>
        </div>
      </section>`;
  }

  private renderLastResult(lang: Lang): string {
    if (!this.result) return '';
    const s = this.result.summary;
    const verdict = (s.overallVerdict || '').toUpperCase();
    const findingsByLevel = group(this.result.findings.filter((f) => !f.dismissed), (f) => f.severity);
    const chips = (['critical', 'major', 'minor', 'nit', 'praise'] as const)
      .filter((k) => (findingsByLevel[k] || []).length > 0)
      .map((k) => `<span class="chip chip-${k}"><span class="swatch" aria-hidden="true"></span>${esc(t(`panel.${k}` as Parameters<typeof t>[0], lang))}<b>${(findingsByLevel[k] || []).length}</b></span>`)
      .join('') || `<span class="chip chip-nit"><span class="swatch" aria-hidden="true"></span>${esc(t('summary.noFindings', lang))}</span>`;
    return /* html */ `
      <section class="card card--result">
        <div class="result__hdr">
          <div class="result__title">
            <span class="kicker">${esc(t('summary.lastReview', lang))}</span>
            <h3><code>${esc(s.branch)}</code> <span class="vs">${esc(t('summary.vs', lang))}</span> <code>${esc(s.baseBranch)}</code></h3>
          </div>
          <span class="verdict" data-v="${esc(s.overallVerdict || '')}">${esc(verdict)}</span>
        </div>
        <div class="result__meta">
          <span>${esc(t('summary.files', lang, { count: s.filesChanged }))}</span><span class="sep">·</span>
          <span class="add">+${s.linesAdded}</span><span class="del">/-${s.linesRemoved}</span><span class="sep">·</span>
          <span>${esc(t('summary.risk', lang, { score: s.riskScore }))}</span><span class="sep">·</span>
          <span>${esc(t('summary.seconds', lang, { seconds: Math.round(this.result.durationMs / 1000) }))}</span>
        </div>
        <div class="chips">${chips}</div>
        ${s.executiveSummary ? `<details open><summary>${esc(t('summary.executiveSummary', lang))}</summary><p>${esc(s.executiveSummary)}</p></details>` : ''}
        ${s.topConcerns.length ? `<details><summary>${esc(t('summary.topConcerns', lang, { count: s.topConcerns.length }))}</summary><ul>${s.topConcerns.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
        ${s.strengths.length ? `<details><summary>${esc(t('summary.strengths', lang, { count: s.strengths.length }))}</summary><ul>${s.strengths.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
        <div class="card__actions">
          <button class="btn btn--ghost btn--sm" data-act="export" type="button" title="${esc(t('summary.exportTitle', lang))}">
            ${esc(t('summary.export', lang))}
          </button>
        </div>
      </section>`;
  }

  private renderHistory(lang: Lang): string {
    const entries = this.deps.getHistory().slice(0, 5);
    if (entries.length === 0) return '';
    const items = entries
      .map((e) => {
        const ago = formatAgo(Date.now() - e.finishedAt, lang);
        const counts = e.critical + e.major > 0
          ? `<span class="hist__counts">${e.critical ? `<span class="hist__crit">${e.critical}</span>` : ''}${e.major ? `<span class="hist__maj">${e.major}</span>` : ''}</span>`
          : '';
        return /* html */ `
          <li class="hist__row" data-recall="${esc(e.id)}" role="button" tabindex="0">
            <span class="hist__main">
              <code class="hist__head">${esc(e.headBranch)}</code>
              <span class="hist__vs">${esc(t('summary.vs', lang))}</span>
              <code class="hist__base">${esc(e.baseBranch)}</code>
            </span>
            <span class="hist__side">
              <span class="hist__verdict" data-v="${esc(e.verdict)}">${esc((e.verdict || '').toUpperCase())}</span>
              ${counts}
              <span class="hist__ago">${esc(ago)}</span>
            </span>
          </li>`;
      })
      .join('');
    return /* html */ `
      <section class="card card--history">
        <h4 class="card__h">${esc(t('summary.history', lang))}</h4>
        <ul class="hist">${items}</ul>
      </section>`;
  }

  private renderFooter(lang: Lang): string {
    if (this.runState.kind === 'running' || this.result || this.partial) return '';
    return /* html */ `<p class="hint">${esc(t('summary.hintEmpty', lang))}</p>`;
  }
}

function group<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) {
    const k = key(x);
    (out[k] = out[k] || []).push(x);
  }
  return out;
}

function formatAgo(ms: number, lang: Lang): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('summary.agoSec', lang, { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('summary.agoMin', lang, { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('summary.agoHour', lang, { n: h });
  const d = Math.round(h / 24);
  return t('summary.agoDay', lang, { n: d });
}

function esc(s: string): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function wrap(nonce: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
:root{
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px;
  --t-xs:11px; --t-sm:12px; --t-md:13px; --t-lg:14px;
  --fg: var(--vscode-foreground);
  --fg-muted: color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
  --fg-subtle: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
  --bg: var(--vscode-sideBar-background, var(--vscode-editor-background));
  --bg-inset: var(--vscode-input-background, rgba(127,127,127,.08));
  --bg-card: color-mix(in srgb, var(--fg) 4%, transparent);
  --bg-code: var(--vscode-textCodeBlock-background, rgba(127,127,127,.1));
  --border: var(--vscode-panel-border, rgba(127,127,127,.25));
  --accent: #7c5cff;
  --accent-fg: #fff;
  --accent-hover: #8c6dff;
  --danger: #e5484d;
  --warn:   #f4b03c;
  --info:   #4493f8;
  --ok:     #2eb886;
  --sev-critical:#e5484d; --sev-major:#f4b03c; --sev-minor:#4493f8; --sev-nit:#2eb886; --sev-praise:#a374ff;
}
*,*::before,*::after{ box-sizing:border-box }
body{
  margin:0; padding: var(--s-3);
  font-family: var(--vscode-font-family);
  font-size: var(--t-md);
  line-height: 1.5;
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
:focus{ outline:none }
:focus-visible{ box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); border-radius: 4px }

h3,h4{ margin:0; font-weight:600 }
p{ margin: var(--s-1) 0; color: var(--fg) }
ul{ margin: var(--s-1) 0 0; padding-left: var(--s-4); color: var(--fg-muted) }
li{ margin-bottom: 3px }
code{
  background: var(--bg-code);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: .92em;
}

/* Brand */
.brand{
  display:flex; align-items:center; gap: var(--s-2);
  margin-bottom: var(--s-3);
}
.brand__dot{
  width:8px; height:8px; border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  flex-shrink:0;
}
.brand__name{
  font-size: var(--t-lg);
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
}
.brand__pill{
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 2px var(--s-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  color: var(--fg-muted);
}
.brand__pill[data-state="running"]{ background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent) }
.brand__pill[data-state="failed"]{ background: color-mix(in srgb, var(--danger) 22%, transparent); color: var(--danger) }
.brand__pill[data-state="paused"]{ background: color-mix(in srgb, var(--warn) 28%, transparent); color: var(--warn) }
.brand__pill[data-state="done"]{ background: color-mix(in srgb, var(--ok) 22%, transparent); color: var(--ok) }

/* Cards */
.card{
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: var(--s-3);
  margin-bottom: var(--s-3);
}
.card--live{ border-color: color-mix(in srgb, var(--accent) 35%, var(--border)) }
.card--failed{ border-color: color-mix(in srgb, var(--danger) 35%, var(--border)) }
.card--paused{ border-color: color-mix(in srgb, var(--warn) 35%, var(--border)) }
.card__head{ display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2); margin-bottom: var(--s-2) }
.card__title{
  font-weight: 600;
  font-size: var(--t-sm);
  word-break: break-word;
  overflow-wrap: anywhere;
}
.card__body{ font-size: var(--t-sm); margin: 0 0 var(--s-2) }
.card__body--muted{ color: var(--fg-muted) }
.card__actions{ display:flex; flex-wrap:wrap; gap: var(--s-1); margin-top: var(--s-2) }
.card__meta{
  display:flex; flex-wrap:wrap; align-items:center; gap: 4px;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  margin-top: var(--s-2);
  font-variant-numeric: tabular-nums;
}
.card__meta .meta-pass{ color: var(--accent); font-weight: 600 }
.card__meta .meta-sep{ color: var(--fg-subtle) }
.card__meta .meta-time{ margin-left: auto }
.card__h{
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  margin: 0 0 var(--s-2);
}

/* Progress bar */
.progress{
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  overflow: hidden;
}
.progress__bar{
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  transition: width 200ms ease-out;
}

/* Branch row in quick actions */
.branch-row{
  display:flex; align-items:center; gap: 4px;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  flex-wrap: wrap;
  margin-bottom: var(--s-2);
}
.branch-row__label{
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  font-size: 10px;
  color: var(--fg-subtle);
  margin-right: 2px;
}
.branch-row__vs{ color: var(--fg-subtle) }
.branch-row__name{
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Buttons */
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap: var(--s-1);
  font: inherit;
  font-size: var(--t-sm);
  font-weight: 500;
  padding: 5px var(--s-3);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
  white-space: nowrap;
}
.btn--sm{ font-size: var(--t-xs); padding: 4px var(--s-2) }
.btn--primary{ background: var(--accent); color: var(--accent-fg); font-weight: 600; flex: 1 1 auto; min-width: 0 }
.btn--primary:hover{ background: var(--accent-hover) }
.btn--ghost{ background: transparent; color: var(--fg); border: 1px solid var(--border) }
.btn--ghost:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent) }
.btn--danger{ background: transparent; color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 50%, var(--border)) }
.btn--danger:hover{ background: color-mix(in srgb, var(--danger) 12%, transparent) }

/* Result */
.result__hdr{ display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2); margin-bottom: var(--s-2) }
.kicker{
  display:block;
  font-size: 10px;
  font-weight:600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  margin-bottom: 2px;
}
.result__title h3{
  font-size: var(--t-md);
  line-height: 1.35;
  margin:0;
  overflow-wrap: anywhere;
}
.vs{ color: var(--fg-subtle); font-weight:400; padding: 0 2px }

.verdict{
  flex-shrink: 0;
  padding: 2px var(--s-2);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  color: var(--accent-fg);
  background: var(--fg-subtle);
  white-space: nowrap;
  align-self: flex-start;
}
.verdict[data-v="block"]                 { background: var(--sev-critical) }
.verdict[data-v="needs-changes"]         { background: var(--sev-major); color:#1a1a1a }
.verdict[data-v="approve-with-comments"] { background: var(--sev-minor) }
.verdict[data-v="approve"]               { background: var(--sev-nit); color:#0a2e1c }
.verdict[data-v="praise"]                { background: var(--sev-praise) }

.result__meta{
  display:flex; flex-wrap:wrap; align-items:center; gap: 4px;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  margin-bottom: var(--s-2);
  font-variant-numeric: tabular-nums;
}
.result__meta .sep{ color: var(--fg-subtle) }
.result__meta .add{ color: var(--sev-nit) }
.result__meta .del{ color: var(--sev-major) }

.chips{ display:flex; flex-wrap:wrap; gap: 4px; margin-bottom: var(--s-2) }
.chip{
  display:inline-flex; align-items:center; gap: 4px;
  padding: 2px var(--s-2);
  border-radius: 999px;
  font-size: var(--t-xs);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.chip .swatch{ width:6px; height:6px; border-radius:50%; background: var(--fg-subtle) }
.chip b{ font-weight:600; color: var(--fg) }
.chip-critical .swatch{ background: var(--sev-critical) }
.chip-major    .swatch{ background: var(--sev-major) }
.chip-minor    .swatch{ background: var(--sev-minor) }
.chip-nit      .swatch{ background: var(--sev-nit) }
.chip-praise   .swatch{ background: var(--sev-praise) }

details{
  margin-top: var(--s-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-inset);
}
details summary{
  cursor: pointer;
  padding: var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--fg);
  list-style: none;
}
details summary::-webkit-details-marker{ display:none }
details summary::before{
  content: '▸';
  display: inline-block;
  margin-right: 4px;
  color: var(--fg-muted);
  transition: transform 120ms ease;
}
details[open] summary::before{ transform: rotate(90deg) }
details p, details ul{ padding: 0 var(--s-2) var(--s-2) }
details ul{ padding-left: calc(var(--s-2) + var(--s-4)) }
details p{ font-size: var(--t-xs); color: var(--fg-muted); line-height: 1.55 }

/* History */
.hist{ list-style: none; padding: 0; margin: 0 }
.hist__row{
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-1) var(--s-2);
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease;
}
.hist__row:hover, .hist__row:focus-visible{
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}
.hist__main{
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-xs);
  display:flex; align-items:center; gap: 2px;
}
.hist__head, .hist__base{
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.hist__vs{ color: var(--fg-subtle); padding: 0 2px }
.hist__side{
  display:flex; align-items:center; gap: 4px;
  font-size: 10px;
  color: var(--fg-muted);
  flex-shrink: 0;
}
.hist__verdict{
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 700;
  letter-spacing: .06em;
  color: var(--accent-fg);
  background: var(--fg-subtle);
}
.hist__verdict[data-v="block"]                 { background: var(--sev-critical) }
.hist__verdict[data-v="needs-changes"]         { background: var(--sev-major); color:#1a1a1a }
.hist__verdict[data-v="approve-with-comments"] { background: var(--sev-minor) }
.hist__verdict[data-v="approve"]               { background: var(--sev-nit); color:#0a2e1c }
.hist__verdict[data-v="praise"]                { background: var(--sev-praise) }
.hist__counts{ display:inline-flex; gap: 2px }
.hist__crit{ background: var(--sev-critical); color: #fff; padding: 0 4px; border-radius: 3px; font-weight: 700 }
.hist__maj { background: var(--sev-major);    color: #1a1a1a; padding: 0 4px; border-radius: 3px; font-weight: 700 }
.hist__ago{ color: var(--fg-subtle) }

.hint{
  color: var(--fg-subtle);
  font-size: var(--t-xs);
  font-style: italic;
  margin: var(--s-2) 0 0;
}

@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{ transition: none!important; animation: none!important }
}
</style>
</head>
<body>
${body}
<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (ev)=>{
    const a = ev.target.closest('[data-act]');
    if (a) {
      ev.preventDefault();
      vscode.postMessage({ type: a.dataset.act });
      return;
    }
    const h = ev.target.closest('[data-recall]');
    if (h) {
      ev.preventDefault();
      vscode.postMessage({ type: 'recall', id: h.dataset.recall });
    }
  });
  document.addEventListener('keydown', (ev)=>{
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const h = ev.target.closest && ev.target.closest('[data-recall]');
    if (h) {
      ev.preventDefault();
      vscode.postMessage({ type: 'recall', id: h.dataset.recall });
    }
  });
})();
</script>
</body>
</html>`;
}
