/**
 * Right column — exec summary, top concerns/strengths bullets, severity filters.
 */
export const RIGHT_COLUMN_CSS = String.raw`
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

`;
