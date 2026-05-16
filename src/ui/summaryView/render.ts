import { ReviewResult } from '../../types';
import { Lang, t } from '../../i18n';
import { PartialReviewSummary } from '../reviewPanel';
import { HistoryEntry, RunState, ALL_REAL_PASSES } from './types';
import { STYLES } from './styles';
import { CLIENT_SCRIPT } from './client';

export function esc(s: string): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function group<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) {
    const k = key(x);
    (out[k] = out[k] || []).push(x);
  }
  return out;
}

export function formatAgo(ms: number, lang: Lang): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('summary.agoSec', lang, { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('summary.agoMin', lang, { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('summary.agoHour', lang, { n: h });
  const d = Math.round(h / 24);
  return t('summary.agoDay', lang, { n: d });
}

interface ViewState {
  lang: Lang;
  result: ReviewResult | null;
  partial: PartialReviewSummary | null;
  runState: RunState;
  branchInfo: { current: string | null; defaultBase: string | null };
  history: HistoryEntry[];
}

function brandStateAttr(s: ViewState): string {
  if (s.runState.kind === 'running') return 'running';
  if (s.runState.kind === 'failed') return 'failed';
  if (s.partial) return 'paused';
  if (s.result) return 'done';
  return 'idle';
}

function brandStateLabel(s: ViewState): string {
  switch (brandStateAttr(s)) {
    case 'running': return t('summary.stateRunning', s.lang);
    case 'failed':  return t('summary.stateFailed', s.lang);
    case 'paused':  return t('summary.statePaused', s.lang);
    case 'done':    return t('summary.stateDone', s.lang);
    default:        return t('summary.stateIdle', s.lang);
  }
}

function renderBrand(s: ViewState): string {
  return /* html */ `
    <header class="brand">
      <span class="brand__dot" aria-hidden="true"></span>
      <span class="brand__name">${esc(t('summary.brand', s.lang))}</span>
      <span class="brand__pill" data-state="${brandStateAttr(s)}">${esc(brandStateLabel(s))}</span>
    </header>`;
}

function renderRunningOrFailed(s: ViewState): string {
  const { lang, runState } = s;
  if (runState.kind === 'running') {
    const planned = runState.plannedPasses;
    const total = planned.length || 1;
    const plannedSet = new Set(planned);
    let completed = 0;
    for (const p of runState.completedPasses) if (plannedSet.has(p)) completed++;
    const pct = Math.min(100, Math.round((completed / total) * 100));
    const elapsed = Math.round((Date.now() - runState.startedAt) / 1000);
    const currentLabel = runState.currentPass
      ? t(`timeline.${runState.currentPass}` as any, lang)
      : t('summary.preparing', lang);
    return /* html */ `
      <section class="card card--live" aria-live="polite">
        <div class="card__head">
          <span class="card__title">${esc(t('summary.reviewing', lang, { head: runState.head, base: runState.base }))}</span>
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
          <span>${esc(t('summary.findingsLive', lang, { count: runState.findingCount }))}</span>
          <span class="meta-sep">·</span>
          <span class="meta-time">${esc(t('summary.seconds', lang, { seconds: elapsed }))}</span>
        </div>
      </section>`;
  }
  if (runState.kind === 'failed') {
    return /* html */ `
      <section class="card card--failed">
        <div class="card__head"><span class="card__title">${esc(t('summary.passFailed', lang, { pass: runState.pass ?? '?' }))}</span></div>
        <p class="card__body">${esc(t('summary.passFailedHint', lang))}</p>
      </section>`;
  }
  return '';
}

function renderPausedBanner(s: ViewState): string {
  if (!s.partial) return '';
  // Don't double-CTA the user while a fresh review is running.
  if (s.runState.kind === 'running') return '';
  const { lang, partial } = s;
  const planned = partial.plannedPasses && partial.plannedPasses.length > 0
    ? partial.plannedPasses
    : ALL_REAL_PASSES.map(String);
  const completedInPlan = partial.completedPasses.filter((p) => planned.includes(p)).length;
  const skippedInPlan = partial.skippedPasses.filter((p) => planned.includes(p)).length;
  const pending = Math.max(0, planned.length - completedInPlan - skippedInPlan);
  const isDifferentBranch =
    !!s.branchInfo.current && s.branchInfo.current !== partial.headBranch;
  const branchBadge = isDifferentBranch
    ? `<span class="branch-badge" title="${esc(t('summary.differentBranchTitle', lang, { branch: partial.headBranch }))}">${esc(t('summary.differentBranchBadge', lang))}</span>`
    : '';
  return /* html */ `
    <section class="card card--paused">
      <div class="card__head">
        <span class="card__title">${esc(t('summary.pausedTitle', lang, { head: partial.headBranch, base: partial.baseBranch }))}${branchBadge}</span>
      </div>
      <p class="card__body card__body--muted">${esc(t('summary.pausedSummary', lang, {
        completed: completedInPlan,
        skipped: skippedInPlan,
        pending,
        findings: partial.findingCount,
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

function renderQuickActions(s: ViewState): string {
  if (s.runState.kind === 'running') return '';
  return /* html */ `
    <section class="card card--actions">
      <div class="card__actions">
        <button class="btn btn--primary btn--sm" data-act="openPanel" type="button">
          ${esc(t('summary.openPanel', s.lang))}
        </button>
      </div>
    </section>`;
}

function renderLastResult(s: ViewState): string {
  if (!s.result) return '';
  const { lang, result } = s;
  const summary = result.summary;
  const verdict = (summary.overallVerdict || '').toUpperCase();
  const findingsByLevel = group(result.findings.filter((f) => !f.dismissed), (f) => f.severity);
  const chips = (['critical', 'major', 'minor', 'nit', 'praise'] as const)
    .filter((k) => (findingsByLevel[k] || []).length > 0)
    .map((k) => `<span class="chip chip-${k}"><span class="swatch" aria-hidden="true"></span>${esc(t(`panel.${k}` as Parameters<typeof t>[0], lang))}<b>${(findingsByLevel[k] || []).length}</b></span>`)
    .join('') || `<span class="chip chip-nit"><span class="swatch" aria-hidden="true"></span>${esc(t('summary.noFindings', lang))}</span>`;
  return /* html */ `
    <section class="card card--result">
      <div class="result__hdr">
        <div class="result__title">
          <span class="kicker">${esc(t('summary.lastReview', lang))}</span>
          <h3><code>${esc(summary.branch)}</code> <span class="vs">${esc(t('summary.vs', lang))}</span> <code>${esc(summary.baseBranch)}</code></h3>
        </div>
        <span class="verdict" data-v="${esc(summary.overallVerdict || '')}">${esc(verdict)}</span>
      </div>
      <div class="result__meta">
        <span>${esc(t('summary.files', lang, { count: summary.filesChanged }))}</span><span class="sep">·</span>
        <span class="add">+${summary.linesAdded}</span><span class="del">/-${summary.linesRemoved}</span><span class="sep">·</span>
        <span>${esc(t('summary.risk', lang, { score: summary.riskScore }))}</span><span class="sep">·</span>
        <span>${esc(t('summary.seconds', lang, { seconds: Math.round(result.durationMs / 1000) }))}</span>
      </div>
      <div class="chips">${chips}</div>
      ${summary.executiveSummary ? `<details><summary>${esc(t('summary.executiveSummary', lang))}</summary><p>${esc(summary.executiveSummary)}</p></details>` : ''}
      ${summary.topConcerns.length ? `<details><summary>${esc(t('summary.topConcerns', lang, { count: summary.topConcerns.length }))}</summary><ul>${summary.topConcerns.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
      ${summary.strengths.length ? `<details><summary>${esc(t('summary.strengths', lang, { count: summary.strengths.length }))}</summary><ul>${summary.strengths.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
      <div class="card__actions">
        <button class="btn btn--ghost btn--sm" data-act="export" type="button" title="${esc(t('summary.exportTitle', lang))}">
          ${esc(t('summary.export', lang))}
        </button>
      </div>
    </section>`;
}

function renderHistory(s: ViewState): string {
  const entries = s.history.slice(0, 5);
  if (entries.length === 0) return '';
  const { lang } = s;
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

function renderFooter(s: ViewState): string {
  if (s.runState.kind === 'running' || s.result || s.partial) return '';
  return /* html */ `<p class="hint">${esc(t('summary.hintEmpty', s.lang))}</p>`;
}

function wrap(nonce: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>${STYLES}</style>
</head>
<body>
${body}
<script nonce="${nonce}">${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

/** Build the full HTML for the summary webview. */
export function renderHtml(s: ViewState): string {
  const nonce = String(Math.random()).slice(2);
  const body = [
    renderBrand(s),
    renderRunningOrFailed(s),
    renderPausedBanner(s),
    renderQuickActions(s),
    s.result ? renderLastResult(s) : '',
    renderHistory(s),
    renderFooter(s),
  ].filter(Boolean).join('\n');
  return wrap(nonce, body);
}

export type { ViewState };
