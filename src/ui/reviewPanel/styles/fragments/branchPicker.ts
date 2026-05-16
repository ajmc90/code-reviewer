/**
 * Branch picker — search, filters, branch lists, ahead/behind pill.
 */
export const BRANCH_PICKER_CSS = String.raw`
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

`;
