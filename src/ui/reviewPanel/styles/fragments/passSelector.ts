/**
 * Passes UI: presets, pass pills, active-passes chips, pass tooltips, run card.
 */
export const PASS_SELECTOR_CSS = String.raw`
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
  position: relative;
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

/* Rich tooltip — same pattern as .pass-tip / .step-tip. CSS-only. */
.preset-tip{
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  max-width: 340px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: var(--vscode-editorWidget-background, var(--bg));
  border: 1px solid var(--border);
  color: var(--fg);
  font-size: var(--t-xs);
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  display: grid;
  gap: 4px;
  white-space: normal;
}
.preset:hover .preset-tip,
.preset:focus-visible .preset-tip{
  opacity: 1;
  transform: translateY(0);
}
.preset-tip__title{ font-weight: 600; color: var(--fg) }
.preset-tip__hint{ color: var(--fg-muted) }
.preset-tip__detail{ color: var(--fg-subtle); font-size: 11px; font-style: italic }

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

/* Calibration tag on the time chip — tiny pill that hints at estimate quality. */
.run-chip__tag{
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--fg-subtle);
  background: transparent;
  margin-left: 2px;
}
.run-chip[data-source="calibrated"] .run-chip__tag{
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.run-chip[data-source="mixed"] .run-chip__tag{
  color: color-mix(in srgb, var(--accent) 70%, var(--fg-muted) 30%);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border) 70%);
}

/* Rich tooltip on the time chip — same pattern as .pass-tip / .step-tip. */
.run-chip--has-tip{
  position: relative;
  cursor: help;
  overflow: visible;
  outline: none;
}
.run-chip__tip{
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  max-width: 340px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: var(--vscode-editorWidget-background, var(--bg));
  border: 1px solid var(--border);
  color: var(--fg);
  font-size: var(--t-xs);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  display: grid;
  gap: 4px;
}
.run-chip--has-tip:hover .run-chip__tip,
.run-chip--has-tip:focus-visible .run-chip__tip{
  opacity: 1;
  transform: translateY(0);
}
.run-chip__tip-title{ font-weight: 600; color: var(--fg) }
.run-chip__tip-hint{ color: var(--fg-muted) }
.run-chip__tip-detail{ color: var(--fg-subtle); font-size: 11px; font-style: italic }
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

`;
