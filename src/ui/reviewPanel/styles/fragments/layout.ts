/**
 * Header, verdict pill, branch chip, top-level panel layout and badges.
 */
export const LAYOUT_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Layout
 * ────────────────────────────────────────────────────────────── */
.app{ display:grid; grid-template-rows:auto 1fr; height:100vh }

header{
  display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  padding: var(--s-3) var(--s-5);
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent);
  /* Pinning the header is a defensive measure: if something inside the
   * webview ever scrolls the body (e.g. a programmatic scrollIntoView or
   * an anchor click), the header stays put instead of being pushed off
   * screen. Combined with body { overflow: hidden } in reset.ts. */
  position: sticky;
  top: 0;
  z-index: 10;
  /* Solid background so content scrolling underneath doesn't bleed
   * through the gradient. */
  background-color: var(--bg);
  background-image: linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent);
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
  white-space: nowrap;
}
/* Overflow protection only on badges WITHOUT the tooltip wrapper — tip-host
 * variants need overflow visible so the popover can render outside the badge.
 * See the matching block in summaryView/styles.ts for the same reasoning. */
.verdict:not(.tip-host){
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.verdict[data-v="running"]{ background: var(--fg-subtle); animation: pulse 1.6s ease-in-out infinite }
.verdict[data-v="block"]            { background: var(--sev-critical) }
.verdict[data-v="needs-changes"]    { background: var(--sev-major); color:#1a1a1a }
.verdict[data-v="approve-with-comments"]{ background: var(--sev-minor) }
.verdict[data-v="approve"]          { background: var(--sev-nit); color:#0a2e1c }
.verdict[data-v="praise"]           { background: var(--sev-praise) }
@keyframes pulse{ 0%,100%{ opacity:.6 } 50%{ opacity:1 } }

.spacer{ flex:1 }

.counters{ display:flex; gap:var(--s-1); align-items:center; flex-wrap:wrap; transition: opacity var(--dur-fast) var(--ease) }
/* When all severity counts are zero (idle / pre-review), the strip is noise.
 * Fade it so the user's eye lands on the CTA, not on six grey "0" pills. */
.counters[data-empty="1"]{ opacity: .35 }
.counters[data-empty="1"]:hover{ opacity: .8 }
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

`;
