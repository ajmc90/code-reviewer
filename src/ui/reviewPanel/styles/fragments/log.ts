/**
 * Streaming log panel beneath the timeline.
 */
export const LOG_CSS = String.raw`
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

`;
