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

/* History — each review is rendered as its own self-contained mini-card
   stacked inside the section card. A 3px verdict-tinted strip on the left
   edge gives instant outcome recognition at a glance; hover lifts the card
   1px and brings the strip to full saturation. Layout per card:
     row top: [head → base] ........................ [verdict pill]
     row bot: [● 1 crit] [● 3 maj] / [• clean]       29m ago        */
.hist{
  list-style: none;
  padding: 0; margin: 0;
  display: flex; flex-direction: column;
  gap: 6px;
}
.card--history{
  /* Slightly inset content so the inner mini-cards have breathing room
     on the sides without colliding with the outer card border. */
  padding: var(--s-3) var(--s-2) calc(var(--s-2) + 2px);
}
.card--history .card__h{
  display: flex; align-items: center; gap: 6px;
  padding: 0 calc(var(--s-1) + 2px);
  margin-bottom: var(--s-2);
}
.card__h-text{ flex: 0 0 auto }
.card__h-count{
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px;
  padding: 0 5px;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  color: var(--fg-muted);
  border-radius: 9px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

/* ── Mini-card per review ──────────────────────────────────────── */
.hist__card{
  position: relative;
  display: flex;
  background: color-mix(in srgb, var(--fg) 3%, transparent);
  border: 1px solid color-mix(in srgb, var(--fg) 9%, transparent);
  border-radius: 7px;
  cursor: pointer;
  overflow: hidden;
  transition: background 140ms ease, border-color 140ms ease,
              transform 140ms ease, box-shadow 140ms ease;
}
.hist__card:hover{
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  border-color: color-mix(in srgb, var(--fg) 16%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px -2px color-mix(in srgb, var(--bg) 65%, transparent);
}
.hist__card:focus-visible{
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
}
.hist__card:active{
  transform: translateY(0);
}

/* Verdict-tinted strip down the left edge — muted at rest, saturated on
   hover. Width grows from 2px to 3px on hover for a subtle "engage" cue. */
.hist__card-strip{
  flex: 0 0 2px;
  background: var(--fg-subtle);
  opacity: .5;
  transition: width 140ms ease, opacity 140ms ease, background 140ms ease;
}
.hist__card[data-verdict="block"]                 .hist__card-strip{ background: var(--sev-critical) }
.hist__card[data-verdict="needs-changes"]         .hist__card-strip{ background: var(--sev-major) }
.hist__card[data-verdict="approve-with-comments"] .hist__card-strip{ background: var(--sev-minor) }
.hist__card[data-verdict="approve"]               .hist__card-strip{ background: var(--sev-nit) }
.hist__card[data-verdict="praise"]                .hist__card-strip{ background: var(--sev-praise) }
.hist__card:hover .hist__card-strip,
.hist__card:focus-visible .hist__card-strip{
  flex-basis: 3px;
  opacity: 1;
}

.hist__card-body{
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px 10px 8px 10px;
  display: flex; flex-direction: column;
  gap: 6px;
}

.hist__row{
  display: flex; align-items: center;
  min-width: 0;
  gap: 8px;
}

/* ── Branch chips ──────────────────────────────────────────────── */
.hist__branches{
  flex: 1 1 0;
  min-width: 0;
  display: flex; align-items: center;
  gap: 5px;
  font-size: 11px;
}
.hist__head, .hist__base{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
  font-size: 11px;
  letter-spacing: -.01em;
  border: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
}
.hist__head{
  flex: 1 1 auto;
  color: var(--fg);
  font-weight: 600;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
}
.hist__base{
  flex: 0 1 auto;
  max-width: 50%;
  color: var(--fg-muted);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  font-weight: 500;
}
.hist__arrow{
  color: var(--fg-subtle);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  line-height: 1;
}

/* ── Verdict pill ──────────────────────────────────────────────── */
.hist__verdict{
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px 3px 6px;
  border-radius: 10px;
  font-weight: 700;
  letter-spacing: .055em;
  font-size: 9.5px;
  text-transform: uppercase;
  color: var(--accent-fg);
  background: var(--fg-subtle);
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow:
    0 1px 0 color-mix(in srgb, #000 12%, transparent) inset,
    0 -1px 0 color-mix(in srgb, #fff 18%, transparent) inset;
}
.hist__verdict:not(.tip-host){
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hist__verdict-ico{
  display: inline-flex; align-items: center; justify-content: center;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: color-mix(in srgb, #000 22%, transparent);
  color: inherit;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}
.hist__verdict-text{
  font-variant-numeric: tabular-nums;
}
.hist__verdict[data-v="block"]                 { background: var(--sev-critical) }
.hist__verdict[data-v="needs-changes"]         { background: var(--sev-major); color:#1a1a1a }
.hist__verdict[data-v="needs-changes"] .hist__verdict-ico{ background: color-mix(in srgb, #000 25%, transparent); color:#1a1a1a }
.hist__verdict[data-v="approve-with-comments"] { background: var(--sev-minor) }
.hist__verdict[data-v="approve"]               { background: var(--sev-nit); color:#0a2e1c }
.hist__verdict[data-v="approve"] .hist__verdict-ico{ background: color-mix(in srgb, #000 22%, transparent); color:#0a2e1c }
.hist__verdict[data-v="praise"]                { background: var(--sev-praise) }

/* ── Severity chips ────────────────────────────────────────────── */
.hist__counts{
  display: inline-flex; align-items: center; gap: 5px;
  flex: 1 1 auto;
  min-width: 0;
}
.hist__sev{
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 7px 2px 6px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
  background: color-mix(in srgb, var(--fg) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--fg) 7%, transparent);
  line-height: 1.4;
}
.hist__sev-dot{
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 1.5px color-mix(in srgb, currentColor 15%, transparent);
}
.hist__sev-n{ font-variant-numeric: tabular-nums }
.hist__sev[data-sev="critical"]{
  color: color-mix(in srgb, var(--sev-critical) 85%, var(--fg));
  background: color-mix(in srgb, var(--sev-critical) 14%, transparent);
  border-color: color-mix(in srgb, var(--sev-critical) 28%, transparent);
}
.hist__sev[data-sev="critical"] .hist__sev-dot{ background: var(--sev-critical) }
.hist__sev[data-sev="major"]{
  color: color-mix(in srgb, var(--sev-major) 92%, var(--fg));
  background: color-mix(in srgb, var(--sev-major) 14%, transparent);
  border-color: color-mix(in srgb, var(--sev-major) 28%, transparent);
}
.hist__sev[data-sev="major"] .hist__sev-dot{ background: var(--sev-major) }
.hist__sev--clean{
  color: color-mix(in srgb, var(--sev-nit) 88%, var(--fg));
  background: color-mix(in srgb, var(--sev-nit) 10%, transparent);
  border-color: color-mix(in srgb, var(--sev-nit) 24%, transparent);
  text-transform: lowercase;
}
.hist__sev--clean .hist__sev-dot{ background: var(--sev-nit) }

.hist__ago{
  color: var(--fg-subtle);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  margin-left: auto;
  cursor: help;
}

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
