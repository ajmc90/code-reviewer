/**
 * Right column — review summary (collapsible verdict bar + bullets),
 * severity filters, category filters.
 */
export const RIGHT_COLUMN_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Review summary — three layers (verdict bar + lead/concerns + strengths)
 * The bar stays visible when the body is collapsed, so the verdict and
 * severity counts remain accessible without re-expanding.
 * ────────────────────────────────────────────────────────────── */
.summary{
  margin-bottom: var(--s-5);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--bg);
  overflow: hidden;
  border-left-width: 4px;
}
.summary[data-verdict="block"]{ border-left-color: var(--sev-critical) }
.summary[data-verdict="needs-changes"]{ border-left-color: var(--sev-major) }
.summary[data-verdict="approve-with-comments"]{ border-left-color: var(--sev-minor) }
.summary[data-verdict="approve"]{ border-left-color: var(--sev-nit) }
.summary[data-verdict="praise"]{ border-left-color: var(--sev-praise) }

/* Verdict bar — clickable header that toggles the body. Always visible. */
.summary__bar{
  display: flex; align-items: center; gap: var(--s-3);
  width: 100%;
  padding: var(--s-3) var(--s-4);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
  border: 0;
  color: var(--fg);
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast) var(--ease);
}
.summary__bar:hover{ background: color-mix(in srgb, var(--fg) 5%, transparent) }
.summary__bar:focus-visible{
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
/* Match the finding-card .chevron (18×18, rotates 90° when expanded) so the
 * collapse affordance is visually consistent across the panel. */
.summary__chev{
  flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  padding: 2px;
  border-radius: var(--r-sm);
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 1;
  transition:
    transform var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.summary__bar:hover .summary__chev{
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}
.summary__bar[aria-expanded="true"] .summary__chev{ transform: rotate(90deg) }

/* Verdict pill — solid color block by verdict, like a status badge. */
.summary__verdict{
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  background: var(--fg-subtle);
  color: var(--accent-fg);
}
.summary__verdict-icon{
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px;
  font-size: 10px; font-weight: 700;
}
.summary[data-verdict="block"] .summary__verdict{ background: var(--sev-critical); color: #fff }
.summary[data-verdict="needs-changes"] .summary__verdict{ background: var(--sev-major); color: #1a1a1a }
.summary[data-verdict="approve-with-comments"] .summary__verdict{ background: var(--sev-minor); color: #fff }
.summary[data-verdict="approve"] .summary__verdict{ background: var(--sev-nit); color: #0a2e1c }
.summary[data-verdict="praise"] .summary__verdict{ background: var(--sev-praise); color: #1a1a1a }

.summary__title{
  flex: 0 0 auto;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--fg);
}
.summary__meta{
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--t-xs);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary__sev-chips{
  flex: 0 0 auto;
  display: inline-flex; gap: 4px; align-items: center;
}
.summary__sev-chip{
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg);
}
.summary__sev-chip[data-sev="critical"]{ background: color-mix(in srgb, var(--sev-critical) 25%, transparent); color: var(--fg) }
.summary__sev-chip[data-sev="major"]{ background: color-mix(in srgb, var(--sev-major) 25%, transparent); color: var(--fg) }
.summary__sev-chip[data-sev="minor"]{ background: color-mix(in srgb, var(--sev-minor) 25%, transparent); color: var(--fg) }
.summary__sev-chip[hidden]{ display: none }
.summary__sev-chip .summary__sev-dot{
  width: 6px; height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.summary__sev-chip[data-sev="critical"] .summary__sev-dot{ background: var(--sev-critical) }
.summary__sev-chip[data-sev="major"] .summary__sev-dot{ background: var(--sev-major) }
.summary__sev-chip[data-sev="minor"] .summary__sev-dot{ background: var(--sev-minor) }

/* Body — collapsible. Uses hidden attribute toggled by JS to avoid the
 * cost of CSS-only animations on long content; keeps a11y simple. */
.summary__body{
  padding: var(--s-4) var(--s-5) var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-4);
}
.summary__body[hidden]{ display: none }

/* Lead paragraph — the executiveSummary text. Clamped by default with an
 * inline expand toggle that's injected by JS when the text is long. */
.summary__lead{
  margin: 0;
  font-size: var(--t-md);
  line-height: var(--lh-loose);
  color: var(--fg);
}
.summary__lead.summary__lead--clamped{
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.summary__expand{
  align-self: flex-start;
  margin-top: calc(-1 * var(--s-2));
  background: transparent; border: 0;
  color: var(--accent);
  font: inherit; font-size: var(--t-xs);
  cursor: pointer; padding: 2px 0;
}
.summary__expand:hover{ text-decoration: underline }

/* Concerns + strengths — stacked, not side-by-side. Strengths is visually
 * de-emphasized (smaller header, muted color) since it's always secondary
 * to the action items. */
.summary__concerns,
.summary__strengths{
  display: flex; flex-direction: column; gap: var(--s-2);
}
.summary__h3{
  margin: 0;
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
  display: flex; align-items: baseline; gap: var(--s-2);
}
.summary__h3--muted{ color: var(--fg-subtle) }
.summary__count{
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--fg-subtle);
  text-transform: none;
  font-variant-numeric: tabular-nums;
}
.summary__list{
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex; flex-direction: column; gap: 4px;
}
.summary__list li{
  position: relative;
  padding: 6px 10px 6px 22px;
  border-radius: var(--r-sm);
  font-size: var(--t-sm);
  line-height: var(--lh-normal);
  color: var(--fg);
}
.summary__list--concerns li{
  background: color-mix(in srgb, var(--fg) 3%, transparent);
}
.summary__list--concerns li::before{
  content: '';
  position: absolute;
  left: 10px;
  top: 11px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--fg-subtle);
}
.summary__list--concerns li[data-sev="critical"]::before{ background: var(--sev-critical) }
.summary__list--concerns li[data-sev="major"]::before{ background: var(--sev-major) }
.summary__list--concerns li[data-sev="minor"]::before{ background: var(--sev-minor) }
.summary__list--strengths li{
  padding-left: 22px;
  color: var(--fg-muted);
  font-size: var(--t-xs);
}
.summary__list--strengths li::before{
  content: '✓';
  position: absolute;
  left: 8px; top: 5px;
  color: var(--sev-nit);
  font-size: 11px;
  font-weight: 700;
}
.summary__list--strengths li:hover{ color: var(--fg) }

/* ─────────────────────────────────────────────────────────────────
 * Filters + categories
 *
 * Layout: row 1 = severity chips (wraps), row 2 = search with icon,
 * row 3 = category chips (dynamic). The whole wrap is sticky so the
 * filter bar stays visible while the user scrolls through findings —
 * losing the filter on a long review felt like losing control of the
 * panel.
 * ────────────────────────────────────────────────────────────── */
.filters-wrap{
  display:flex; flex-direction: column; gap: var(--s-2);
  margin-bottom: var(--s-3);
  position: sticky;
  /* Sit below the in-progress sticky header (40px tall when present).
   * The header itself is z-index 6 and uses top:0; we use a CSS var so
   * the offset is overridable when state changes. Using a var keeps the
   * default at 0 (no header) so the filters stick to the top of the
   * pane when no review is running. */
  top: var(--filters-sticky-top, 0);
  z-index: 5;
  padding: var(--s-3) 0 var(--s-2);
  background: linear-gradient(
    to bottom,
    var(--bg) 0%,
    var(--bg) calc(100% - 6px),
    color-mix(in srgb, var(--bg) 0%, transparent) 100%
  );
  /* When the summary bar sits above, the sticky filters need a tiny offset
   * so the summary's bottom edge still reads cleanly. summary already has
   * its own margin-bottom; this just guards against zero-margin themes. */
  margin-top: calc(-1 * var(--s-2));
}
.filters-wrap[hidden]{ display: none }
.filters{
  display:flex; gap: var(--s-2); flex-wrap:wrap; align-items:center;
}
.filter{
  display: inline-flex; align-items: center; gap: 8px;
  height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.filter:hover{
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  border-color: color-mix(in srgb, var(--fg) 22%, var(--border));
}
.filter[aria-pressed="true"]{
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}
/* Severity chips get a tiny color dot before the label so the user
 * learns the chip ↔ severity color mapping that's used everywhere
 * else (left stripe of cards, summary sev chips). Pure decoration — no
 * extra click target. */
.filter--sev::before{
  content: '';
  width: 7px; height: 7px;
  border-radius: 50%;
  display: inline-block;
  background: var(--fg-subtle);
  flex-shrink: 0;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 8%, transparent);
}
.filter--sev[data-sev="critical"]::before{ background: var(--sev-critical) }
.filter--sev[data-sev="major"]::before{ background: var(--sev-major) }
.filter--sev[data-sev="minor"]::before{ background: var(--sev-minor) }
.filter--sev[data-sev="nit"]::before{ background: var(--sev-nit) }
.filter--sev[data-sev="praise"]::before{ background: var(--sev-praise) }
/* When pressed, drop the outer ring on the dot so it doesn't read as
 * "double-circled" against the accent background. */
.filter--sev[aria-pressed="true"]::before{
  box-shadow: 0 0 0 1px color-mix(in srgb, #fff 30%, transparent);
}
/* Count next to the chip label. Reads as a quiet companion to the label,
 * not as its own badge — earlier circular-badge styling made single-digit
 * counts look ovaloid and disproportionate inside a 26px-tall chip.
 * Tabular-nums so a 2→3 transition doesn't shift the chip width. */
.filter__count{
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg-subtle);
  line-height: 1;
  letter-spacing: 0;
}
.filter[aria-pressed="true"] .filter__count{
  color: color-mix(in srgb, #fff 80%, transparent);
}
.filter__count[hidden]{ display: none }
/* Search row — separate from the chips so it doesn't compete for flex
 * space and never gets pushed to a corner of a wrapped chip row. The
 * icon sits inside via absolute positioning so the input retains its
 * native clear button. */
.filters-search{
  position: relative;
  display: flex;
  align-items: center;
}
.filters-search__icon{
  position: absolute;
  left: var(--s-3);
  width: 14px; height: 14px;
  color: var(--fg-subtle);
  pointer-events: none;
}
.filters-search .search,
.filters .search{
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  padding: 6px var(--s-3) 6px calc(var(--s-3) + 14px + 8px);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg-inset);
  color: var(--fg);
  font: inherit;
  font-size: var(--t-sm);
  transition:
    border-color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.filters-search .search:hover{ border-color: color-mix(in srgb, var(--fg) 20%, transparent) }
.filters-search .search:focus{
  outline: none;
  border-color: var(--accent);
  background: var(--bg);
}
.filters-search .search::placeholder{ color: var(--fg-subtle) }
.filters-cat{
  display:flex; gap: 6px; flex-wrap:wrap; align-items:center;
}
.filters-cat .filter-cat-label{
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
  margin-right: 4px;
  font-weight: 600;
}
.cat-chip{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  text-transform: lowercase;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.cat-chip:hover{
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  border-color: color-mix(in srgb, var(--fg) 22%, var(--border));
}
.cat-chip[aria-pressed="true"]{
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--fg);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.cat-chip .count{
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}
.cat-chip[aria-pressed="true"] .count{
  color: var(--fg);
}
.cat-chip[data-empty="1"]{ opacity: .45 }

`;
