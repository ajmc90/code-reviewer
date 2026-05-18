export const STYLES = String.raw`
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
.branch-badge{
  display: inline-block;
  margin-left: var(--s-2);
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  border-radius: 3px;
  background: color-mix(in srgb, var(--warn) 24%, transparent);
  color: var(--warn);
  vertical-align: middle;
  cursor: help;
}
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
/* Self-critique decision delta — appears below .card__meta while running.
   The line stays muted so it reads as supporting context, not a status. */
.card__delta{
  display:flex; flex-wrap:wrap; align-items:center; gap: 4px;
  margin-top: 4px;
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
  cursor: help;
}
/* Sidebar Stop button: keep it aligned to the *first* line of the title even
   when the title wraps. Without align-self the .card__head's flex-start
   alignment leaves the button visibly floating away from the text. */
.card__head .btn--danger.btn--sm{
  align-self: flex-start;
  margin-top: 1px;
  flex-shrink: 0;
}
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
/* Defensive bound only on badges WITHOUT the tooltip wrapper. Tip-host
 * variants must allow overflow so the .tip popover can render outside the
 * badge box. Normalized verdicts (enum values) always render as tip-host,
 * so the defensive bound below only catches legacy / un-normalized data. */
.verdict:not(.tip-host){
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
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
  white-space: nowrap;
  flex-shrink: 0;
}
/* Same overflow protection as .verdict, scoped to non-tooltip variants. */
.hist__verdict:not(.tip-host){
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* Generic rich tooltip — same pattern as the review panel's .tip system,
 * duplicated here because the sidebar webview has its own isolated CSS.
 * Keep the rules in sync if you change the panel-side equivalent. */
.tip-host{ position: relative }
.tip{
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  max-width: 280px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: var(--vscode-editorWidget-background, var(--bg));
  border: 1px solid var(--border);
  color: var(--fg);
  font-size: var(--t-xs);
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity var(--dur-fast,150ms) var(--ease,ease), transform var(--dur-fast,150ms) var(--ease,ease);
  display: grid;
  gap: 4px;
  white-space: normal;
}
.tip-host:hover > .tip,
.tip-host:focus-visible > .tip,
.tip-host:focus-within > .tip{
  opacity: 1;
  transform: translateY(0);
}
.tip--above{ top: auto; bottom: calc(100% + 6px); transform: translateY(2px) }
.tip-host:hover > .tip--above,
.tip-host:focus-visible > .tip--above,
.tip-host:focus-within > .tip--above{ transform: translateY(0) }
.tip--end{ left: auto; right: 0 }
.tip__title{ font-weight: 600; color: var(--fg) }
.tip__hint{ color: var(--fg-muted) }
`;
