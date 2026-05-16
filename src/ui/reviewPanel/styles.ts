export const STYLES = String.raw`
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
  /* Silenced is intentionally low-contrast — these are findings the user
     asked Claude to stop showing. They're visible but never compete with
     real-severity findings for attention. */
  --sev-silenced: #8a8a8a;

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
.counter[data-sev="silenced"] .swatch{ background: var(--sev-silenced) }

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
/* Inline Apply action — primary CTA inside a finding card. The icon plus
   subtle glow help it stand out from the ghost buttons next to it. */
.btn--apply{
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent),
              0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
}
.btn--apply .btn__icon{
  font-size: 0.95em;
  opacity: .95;
}
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

/* Active-pass summary (read-only chips shown when Advanced is collapsed) */
.active-passes{
  display: flex; flex-wrap: wrap; gap: 4px;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  min-height: 22px;
}
.active-passes__group{
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
}
.active-passes__group-label{
  font-size: 9px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--fg-subtle);
}
.active-passes__group-count{
  font-weight: 600; color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.active-passes__group--off{ opacity: .55 }
.active-passes__group--off .active-passes__group-count{ color: var(--fg-subtle) }
.active-passes__empty{ color: var(--fg-subtle); font-style: italic }

/* Advanced toggle (collapses the editable pass pills) */
.advanced-toggle{
  display: flex; align-items: center; gap: var(--s-2);
}
.advanced-toggle__btn{
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--t-xs); font-weight: 600;
  background: transparent; border: 0;
  color: var(--fg-muted); cursor: pointer;
  padding: 4px 6px; border-radius: var(--r-sm);
}
.advanced-toggle__btn:hover{ background: var(--accent-tint, rgba(0,128,255,0.08)); color: var(--fg) }
.advanced-toggle__btn[aria-expanded="true"] .advanced-toggle__chev{ transform: rotate(90deg) }
.advanced-toggle__chev{
  display: inline-block; transition: transform var(--dur-fast) var(--ease);
  font-size: 9px;
}
.advanced-pane{
  display: flex; flex-direction: column; gap: var(--s-2);
  padding-top: var(--s-1);
}
.advanced-pane[hidden]{ display: none }

/* Run section — primary CTA card. Sticky so it survives scroll. */
.section--run{
  position: sticky; bottom: 0;
  margin-top: var(--s-2);
  padding-top: var(--s-2);
  z-index: 5;
  /* fade so content scrolling under it has visual breathing room */
  background: linear-gradient(to bottom, transparent 0, var(--bg) 12px);
}
.run-card{
  display: flex; flex-direction: column; gap: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--accent) 4%, var(--bg));
  box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.05);
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.run-card[data-state="ready"]{
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.run-card[data-state="running"]{
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--bg));
}
.run-card[data-state="blocked"]{
  background: var(--bg);
}
.run-card__head{
  display: flex; align-items: center; gap: var(--s-2);
  flex-wrap: wrap;
}
.run-card__title{
  margin: 0;
  font-size: var(--t-xs); font-weight: 700;
  text-transform: uppercase; letter-spacing: .1em;
  color: var(--fg-muted);
}
.run-card__chips{
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-left: auto;
}
.run-chip{
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  max-width: 220px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.run-chip__icon{
  font-size: 10px; opacity: .8;
}
.run-chip__val{ color: var(--fg); font-family: var(--vscode-editor-font-family) }
.run-chip[data-empty="1"]{
  border-style: dashed;
  color: var(--fg-subtle);
}
.run-chip[data-empty="1"] .run-chip__val{
  color: var(--fg-subtle); font-style: italic;
}
.run-chip[data-tone="time"] .run-chip__val{ font-family: inherit }
.run-card__btn{
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2);
}
.run-card__btn-icon{ font-size: .9em; line-height: 1 }
.run-card__btn[aria-disabled="true"]{
  opacity: .55; cursor: not-allowed;
}
.run-card__msg{
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  min-height: 0;
  line-height: 1.4;
}
.run-card__msg[data-tone="warn"]{ color: var(--severity-major, var(--fg-muted)) }
.run-card__msg[data-tone="info"]{ color: var(--fg-muted) }
.run-card__msg:empty{ display: none }

.btn--lg{
  padding: 9px 14px;
  font-size: var(--t-sm);
  font-weight: 600;
  border-radius: var(--r-md);
}
.sr-only{
  position: absolute !important;
  width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

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
.step--auto-skipped{ opacity: .7 }
.step--consolidation .ico{ color: var(--accent) }
.step-badge{
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 6px; padding: 0 6px;
  font-size: 10px; line-height: 16px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.03em;
  border-radius: var(--r-sm);
  cursor: help;
  border: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--fg-subtle);
}
.step-badge--merged{ color: var(--accent); border-color: var(--accent) }
.step-badge--auto{ color: var(--fg-subtle) }
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
 * Change map (per-file classification from the explore pass)
 * ────────────────────────────────────────────────────────────── */
.changemap{
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--bg);
  padding: var(--s-3);
  margin-bottom: var(--s-3);
  display: flex; flex-direction: column; gap: var(--s-2);
}
.changemap[hidden]{ display: none }
.changemap__head{
  display: flex; align-items: baseline; gap: var(--s-2);
  cursor: pointer; user-select: none;
}
.changemap__title{ font-weight: 600; font-size: var(--t-sm); margin: 0 }
.changemap__count{ color: var(--fg-subtle); font-size: var(--t-xs) }
.changemap__toggle{
  margin-left: auto; background: transparent; border: 0;
  color: var(--fg-subtle); font-size: var(--t-xs); cursor: pointer;
}
.changemap__list{
  display: flex; flex-wrap: wrap; gap: var(--s-2);
}
.changemap--collapsed .changemap__list{ display: none }
.changemap__chip{
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  background: var(--bg-subtle);
  font-family: var(--vscode-editor-font-family);
  cursor: default;
}
.changemap__chip .file{ color: var(--fg) }
.changemap__chip .kind{
  text-transform: lowercase; color: var(--fg-subtle);
  border-left: 1px solid var(--border); padding-left: 6px;
}
.changemap__chip .blast{
  color: var(--accent); font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.04em;
}
.changemap__chip[data-blast="cross-cutting"] .blast{ color: var(--severity-major, var(--accent)) }
.changemap__chip[data-blast="module"] .blast{ color: var(--accent) }
.changemap__chip[data-blast="local"] .blast{ color: var(--fg-subtle) }

/* ─────────────────────────────────────────────────────────────────
 * Related-finding badge
 * ────────────────────────────────────────────────────────────── */
.related-badge{
  display: inline-flex; align-items: center;
  margin-left: 6px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--accent-tint, rgba(0,128,255,0.12));
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--r-sm);
  cursor: pointer;
  text-decoration: none;
}
.related-badge:hover{ background: var(--accent); color: var(--bg) }
.finding--flash{
  animation: finding-flash 1.2s ease-out;
}
@keyframes finding-flash {
  0%   { box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--accent-tint, rgba(0,128,255,0.18)); }
  100% { box-shadow: 0 0 0 0  transparent,    0 0 0 0 transparent; }
}

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
.finding[data-severity="silenced"]{ border-left: 3px dashed var(--sev-silenced) }

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
.sev[data-sev="silenced"]{ background: var(--sev-silenced); color: #1a1a1a }

/* Silenced finding card visuals — muted but still legible. The card stays
   visible (the whole point: user knows it came back) but signals that this
   is a known/dismissed pattern, not new noise. */
.finding[data-severity="silenced"]{
  opacity: .72;
  border-style: dashed;
}
.finding[data-severity="silenced"]:hover{ opacity: 1 }
.silenced-badge{
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 6px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .04em;
  background: color-mix(in srgb, var(--sev-silenced) 22%, transparent);
  color: var(--fg-muted);
  border: 1px solid color-mix(in srgb, var(--sev-silenced) 45%, transparent);
  border-radius: var(--r-sm);
  cursor: help;
}

/* Filter button variant for silenced — keeps the filter row visually muted
   so the "real" severities still dominate. */
.filter--silenced{
  opacity: .75;
  font-style: italic;
}
.filter--silenced:hover, .filter--silenced[aria-pressed="true"]{ opacity: 1; font-style: normal }

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
`;
