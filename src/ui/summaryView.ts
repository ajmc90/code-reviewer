import * as vscode from 'vscode';
import { ReviewResult } from '../types';
import { Lang, t } from '../i18n';

/**
 * Sidebar webview that doubles as a launcher and a quick summary of the last
 * review. The main UI lives in ReviewPanel; this view's job is to:
 *   - give the user an obvious way to open the panel
 *   - show a compact snapshot of the most recent review
 *
 * Every interactive element here routes to a real command — no dead clicks.
 */
export class SummaryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeReviewer.summary';
  private view?: vscode.WebviewView;
  private result: ReviewResult | null = null;

  constructor(private readonly getLang: () => Lang) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.render();
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'openPanel') {
        vscode.commands.executeCommand('claudeReviewer.showPanel');
      } else if (msg?.type === 'run') {
        vscode.commands.executeCommand('claudeReviewer.reviewBranch');
      } else if (msg?.type === 'export') {
        vscode.commands.executeCommand('claudeReviewer.exportReport');
      } else if (msg?.type === 'open' && msg.findingId) {
        vscode.commands.executeCommand('claudeReviewer.openFinding', msg.findingId);
      }
    });
  }

  setResult(result: ReviewResult | null) {
    this.result = result;
    if (this.view) this.view.webview.html = this.render();
  }

  onLanguageChanged() {
    if (this.view) this.view.webview.html = this.render();
  }

  private render(): string {
    const nonce = String(Math.random()).slice(2);
    return wrap(nonce, this.result ? this.renderResult() : this.renderEmpty());
  }

  private renderEmpty(): string {
    const lang = this.getLang();
    return /* html */ `
      <div class="empty">
        <div class="brand"><span class="dot" aria-hidden="true"></span>${esc(t('summary.brand', lang))}</div>
        <p class="lead">${esc(t('summary.tagline', lang))}</p>
        <div class="cta">
          <button class="btn btn--primary" data-act="openPanel" type="button">
            <span aria-hidden="true">⬉</span> ${esc(t('summary.openPanel', lang))}
          </button>
          <button class="btn btn--ghost" data-act="run" type="button">
            <span aria-hidden="true">▶</span> ${esc(t('summary.startReview', lang))}
          </button>
        </div>
        <p class="hint">${esc(t('summary.hintEmpty', lang))}</p>
      </div>`;
  }

  private renderResult(): string {
    const lang = this.getLang();
    const s = this.result!.summary;
    const findingsByLevel = group(this.result!.findings.filter((f) => !f.dismissed), (f) => f.severity);
    const counts = (['critical', 'major', 'minor', 'nit', 'praise'] as const)
      .map((k) => `<span class="chip chip-${k}"><span class="swatch" aria-hidden="true"></span>${esc(t(`panel.${k}` as Parameters<typeof t>[0], lang))}<b>${(findingsByLevel[k] || []).length}</b></span>`)
      .join('');

    const verdictText = (s.overallVerdict || '').toUpperCase();

    return /* html */ `
      <header class="hdr">
        <div class="title">
          <span class="kicker">${esc(t('summary.lastReview', lang))}</span>
          <h2><code>${esc(s.branch)}</code> <span class="vs">${esc(t('summary.vs', lang))}</span> <code>${esc(s.baseBranch)}</code></h2>
        </div>
        <span class="verdict" data-v="${esc(s.overallVerdict || '')}" aria-label="${esc(t('summary.verdictLabel', lang, { verdict: verdictText }))}">${esc(verdictText)}</span>
      </header>

      <div class="meta">
        <span>${esc(t('summary.files', lang, { count: s.filesChanged }))}</span><span class="sep">·</span>
        <span class="add">+${s.linesAdded}</span><span class="del">/-${s.linesRemoved}</span><span class="sep">·</span>
        <span>${esc(t('summary.risk', lang, { score: s.riskScore }))}</span><span class="sep">·</span>
        <span>${esc(t('summary.passes', lang, { count: this.result!.passesRun.length }))}</span><span class="sep">·</span>
        <span>${esc(t('summary.seconds', lang, { seconds: Math.round(this.result!.durationMs / 1000) }))}</span>
      </div>

      <div class="chips" role="group" aria-label="${esc(t('summary.findingsBySeverity', lang))}">${counts}</div>

      <div class="cta">
        <button class="btn btn--primary" data-act="openPanel" type="button">
          <span aria-hidden="true">⬉</span> ${esc(t('summary.openPanel', lang))}
        </button>
        <button class="btn btn--ghost" data-act="run" type="button">
          <span aria-hidden="true">▶</span> ${esc(t('summary.newReview', lang))}
        </button>
        <button class="btn btn--ghost" data-act="export" type="button" title="${esc(t('summary.exportTitle', lang))}">
          ${esc(t('summary.export', lang))}
        </button>
      </div>

      <details ${s.executiveSummary ? 'open' : ''}>
        <summary>${esc(t('summary.executiveSummary', lang))}</summary>
        <p>${esc(s.executiveSummary || t('summary.executiveNone', lang))}</p>
      </details>
      ${s.topConcerns.length ? `<details><summary>${esc(t('summary.topConcerns', lang, { count: s.topConcerns.length }))}</summary><ul>${s.topConcerns.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
      ${s.strengths.length ? `<details><summary>${esc(t('summary.strengths', lang, { count: s.strengths.length }))}</summary><ul>${s.strengths.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
      <p class="hint">${t('summary.hintFull', lang)}</p>
    `;
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
  --t-xs:11px; --t-sm:12px; --t-md:13px; --t-lg:14px; --t-xl:16px;
  --fg: var(--vscode-foreground);
  --fg-muted: color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
  --fg-subtle: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
  --bg: var(--vscode-sideBar-background, var(--vscode-editor-background));
  --bg-inset: var(--vscode-input-background, rgba(127,127,127,.08));
  --bg-code: var(--vscode-textCodeBlock-background, rgba(127,127,127,.1));
  --border: var(--vscode-panel-border, rgba(127,127,127,.25));
  --accent: #7c5cff;
  --accent-fg: #fff;
  --accent-hover: #8c6dff;
  --sev-critical:#e5484d; --sev-major:#f4b03c; --sev-minor:#4493f8; --sev-nit:#2eb886; --sev-praise:#a374ff;
}
*,*::before,*::after{ box-sizing:border-box }
body{
  margin:0; padding: var(--s-4);
  font-family: var(--vscode-font-family);
  font-size: var(--t-md);
  line-height: 1.5;
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
:focus{ outline:none }
:focus-visible{ box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); border-radius: 4px }

h2,h3{ margin:0; font-weight:600 }
p{ margin:0 0 var(--s-2); color: var(--fg) }
code{
  background: var(--bg-code);
  padding: 1px var(--s-1);
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: .92em;
}
ul{ margin: var(--s-1) 0 0; padding-left: var(--s-4); color: var(--fg-muted) }
li{ margin-bottom: 3px }

/* Empty / launcher */
.empty{ display:flex; flex-direction:column; gap: var(--s-3); padding: var(--s-2) 0 }
.brand{
  display:flex; align-items:center; gap: var(--s-2);
  font-size: var(--t-lg);
  font-weight:600;
}
.brand .dot{
  width:8px; height:8px; border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
}
.lead{ color: var(--fg-muted); margin:0 }
.hint{
  color: var(--fg-subtle);
  font-size: var(--t-xs);
  font-style: italic;
  margin: var(--s-1) 0 0;
}

/* Result */
.hdr{ display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2); margin-bottom: var(--s-3) }
.kicker{
  display:block;
  font-size: 10px;
  font-weight:600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  margin-bottom: 2px;
}
.title h2{
  font-size: var(--t-md);
  line-height: 1.35;
  margin:0;
  overflow-wrap: anywhere;
}
.vs{ color: var(--fg-subtle); font-weight:400; padding: 0 2px }

.verdict{
  flex-shrink: 0;
  padding: var(--s-1) var(--s-2);
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

.meta{
  display:flex; flex-wrap:wrap; align-items:center; gap: var(--s-1);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  margin-bottom: var(--s-3);
  font-variant-numeric: tabular-nums;
}
.meta .sep{ color: var(--fg-subtle) }
.meta .add{ color: var(--sev-nit) }
.meta .del{ color: var(--sev-major) }

.chips{ display:flex; flex-wrap:wrap; gap: var(--s-1); margin-bottom: var(--s-3) }
.chip{
  display:inline-flex; align-items:center; gap: var(--s-1);
  padding: 3px var(--s-2);
  border-radius: 999px;
  font-size: var(--t-xs);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.chip .swatch{ width:7px; height:7px; border-radius:50%; background: var(--fg-subtle) }
.chip b{ font-weight:600; color: var(--fg) }
.chip-critical .swatch{ background: var(--sev-critical) }
.chip-major    .swatch{ background: var(--sev-major) }
.chip-minor    .swatch{ background: var(--sev-minor) }
.chip-nit      .swatch{ background: var(--sev-nit) }
.chip-praise   .swatch{ background: var(--sev-praise) }

/* Buttons */
.cta{ display:flex; flex-wrap:wrap; gap: var(--s-1); margin-bottom: var(--s-3) }
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap: var(--s-1);
  font: inherit;
  font-size: var(--t-sm);
  font-weight: 500;
  padding: 6px var(--s-3);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease;
  white-space: nowrap;
}
.btn--primary{
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
}
.btn--primary:hover{ background: var(--accent-hover) }
.btn--ghost{
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
}
.btn--ghost:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent) }

details{
  margin-top: var(--s-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-inset);
}
details summary{
  cursor: pointer;
  padding: var(--s-2) var(--s-3);
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
  margin-right: var(--s-1);
  color: var(--fg-muted);
  transition: transform 120ms ease;
}
details[open] summary::before{ transform: rotate(90deg) }
details p, details ul{ padding: 0 var(--s-3) var(--s-3) }
details ul{ padding-left: calc(var(--s-3) + var(--s-4)) }
details p{ font-size: var(--t-xs); color: var(--fg-muted); line-height: 1.55 }

@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{ transition: none!important; animation: none!important }
}
</style>
</head>
<body>
<div class="root">${body}</div>
<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (ev)=>{
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    ev.preventDefault();
    const act = t.dataset.act;
    if (act === 'openPanel')  vscode.postMessage({type:'openPanel'});
    else if (act === 'run')   vscode.postMessage({type:'run'});
    else if (act === 'export')vscode.postMessage({type:'export'});
  });
})();
</script>
</body>
</html>`;
}
