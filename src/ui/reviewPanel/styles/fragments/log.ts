/**
 * Streaming log panel — now lives EMBEDDED inside the run-card (as an
 * audit-trail footer), not as a standalone section. Header is a compact
 * toggle row, pane is hidden by default. Sizing/colors are tuned so the
 * log doesn't dominate the run-card when expanded.
 */
export const LOG_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Log (embedded in run-card)
 * ────────────────────────────────────────────────────────────── */

/* Container — a thin top divider visually separates the log from the
 * run button above it without adding visual weight. */
.run-card__log{
  border-top: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
  padding-top: var(--s-2);
  margin-top: calc(-1 * var(--s-1));
}

.log-header{
  display: flex; align-items: center; gap: var(--s-2);
  min-height: 22px;
}
.log-count{
  color: var(--fg-subtle);
  font-weight: 500;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.log-toggle{
  flex: 1;
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 0;
  color: var(--fg-muted);
  cursor: pointer;
  padding: 2px 4px; margin: 0 0 0 -4px;
  border-radius: var(--r-sm);
  text-align: left;
  /* Log header reads as a tertiary label inside the run card — small,
   * uppercase like .run-card__title, so the typographic hierarchy is
   * RUN (h2) > log toggle (small-caps) > log content. */
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.log-toggle:hover{
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 5%, transparent);
}
.log-toggle__chev{
  display: inline-block;
  transition: transform var(--dur-fast) var(--ease);
  font-size: 10px;
  color: var(--fg-subtle);
  line-height: 1;
}
.log-toggle[aria-expanded="true"] .log-toggle__chev{ transform: rotate(90deg) }
.log-toggle__label{
  display: inline-flex; align-items: baseline; gap: 6px;
  font: inherit;
}

.log-header__actions{ display: inline-flex; align-items: center; gap: 4px }
.log-header__actions[hidden]{ display: none }
.log-pane{ margin-top: var(--s-2) }
.log-pane[hidden]{ display: none }

.live{
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-2);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  line-height: 1.5;
  /* Cap shorter than before — the log sits inside a sticky run card, so
   * an over-tall pane pushes the START button off-screen when expanded.
   * 240px keeps roughly 12-15 lines of audit visible. */
  max-height: 240px;
  min-height: 80px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg-muted);
  scrollbar-gutter: stable;
}
.live.empty{
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-subtle);
  font-family: var(--vscode-font-family);
  font-style: italic;
  text-align: center;
  min-height: 60px;
}
.live .line{ padding: 1px 0 }
.live .line.warn{ color: var(--sev-major) }
.live .line.error{ color: var(--sev-critical) }
.live .ts{ color: var(--fg-subtle); margin-right: var(--s-2); font-size: 10px }
.live .pass{
  display: inline-block; min-width: 60px;
  color: var(--accent); margin-right: var(--s-1);
  font-weight: 500;
}

`;
