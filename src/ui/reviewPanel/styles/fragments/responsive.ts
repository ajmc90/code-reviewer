/**
 * @media queries for narrow widths.
 */
export const RESPONSIVE_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Responsive
 * ────────────────────────────────────────────────────────────── */
@container left (max-width: 340px){
  .picker-cols{ grid-template-columns: minmax(0,1fr) }
}
/* Narrow right pane (typical when the sidebar is dragged tight): compact
 * the filter chips so eight of them don't wrap into 3 rows. The count
 * badges shrink to a bare number, and the search row keeps its full
 * width because it's already on its own line. */
@container right (max-width: 460px){
  .filters{ gap: 6px }
  .filter{
    padding: 3px var(--s-2);
    font-size: 10px;
  }
  .filter__count{
    min-width: 14px;
    height: 14px;
    padding: 0 4px;
    font-size: 9px;
  }
  .filter--sev::before{ width: 5px; height: 5px }
  .filters-search .search{ font-size: var(--t-xs) }
}
@media (max-width: 760px){
  /* Stacked layout: rows = left (user-resizable), 8px drag handle, right.
   * --left-h defaults to "auto" so the left sizes to content until the user
   * starts dragging the handle; from then on it's a pixel value. */
  main{ grid-template-columns: minmax(0,1fr) !important; grid-template-rows: var(--left-h) 8px 1fr }
  /* Reorient the gutter as a horizontal drag handle. It keeps the same DOM
   * element + event listeners; the JS switches between width/height drag
   * based on viewport. */
  .gutter{
    width: 100%;
    height: 8px;
    cursor: row-resize;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .gutter::before{ inset: -3px 0 }  /* horizontal hit-area enlargement */
  .gutter::after{
    width: 32px; height: 2px;  /* swap orientation of the grip indicator */
  }
  main[data-resizing="1"]{ cursor: row-resize }
  /* Left needs its own scroll back so user-set height actually shows scroll
   * inside the pane instead of growing the document. */
  .left{
    border-right: 0; border-bottom: 0;
    overflow-y: auto;
    min-height: 0;
  }
  .grid2{ grid-template-columns: minmax(0,1fr) }
  .col + .col{ border-left: 0; border-top: 1px solid var(--border) }
  /* Summary bar gets crowded on narrow widths — drop the title and let the
   * verdict pill + sev chips do the work. The meta line wraps. */
  .summary__title{ display: none }
  .summary__meta{ flex-basis: 100%; order: 99 }
  /* In stacked layout the .left pane no longer has its own scroll context —
   * the whole document scrolls. position:sticky then anchors the run card
   * to the viewport, with the right column's findings sliding under it.
   * Drop sticky and let the run card sit in normal flow at the end of the
   * left pane; the user reaches it by scrolling, like any other section. */
  .section--run{
    position: static;
    margin: 0;
    padding: 0;
    box-shadow: none;
    border-top: 0;
    background: transparent;
  }

  /* Collapsed state in stacked layout — the desktop "thin vertical rail"
   * design doesn't translate: the column is full-width here, so a vertical
   * rail stretched across the screen is awkward (lots of empty space, the
   * branch label rotated 90°, stats stacked in a tiny column).
   * Reflow the same elements as a HORIZONTAL header strip:
   *   [● state] [branch ← branch] · [13 20 14 0] [expand chevron]
   * Pin the row height to min-content so the slider/handle sits flush
   * against the bottom of the strip instead of leaving a tall empty band
   * that auto-height would create inside the flex .left container. */
  main[data-collapsed="1"]{
    grid-template-columns: minmax(0,1fr) !important;
    grid-template-rows: min-content 8px 1fr;
  }
  main[data-collapsed="1"] .left{
    padding: var(--s-2) var(--s-3);
    overflow: hidden;
    min-height: 0;
  }
  main[data-collapsed="1"] .left-rail{
    flex-direction: row;
    align-items: center;
    gap: var(--s-3);
    padding-top: 0;
    padding-right: 36px; /* reserve room for the collapse toggle button */
    width: 100%;
    flex-wrap: nowrap;
    min-height: 28px;
  }
  main[data-collapsed="1"] .rail-vert{
    writing-mode: horizontal-tb;
    transform: none;
    max-height: none;
    font-size: var(--t-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 0 1 auto;
  }
  /* Hide the "47 FINDINGS" rail label when collapsed in stacked — the
   * severity counters right next to it already encode the same info more
   * granularly, and on narrow widths it's just visual noise. */
  main[data-collapsed="1"] #rail-pass{ display: none }
  main[data-collapsed="1"] .rail-stats{
    flex-direction: row;
    gap: 8px;
    margin: 0 0 0 auto;
    flex-shrink: 0;
    align-items: center;
  }
  /* Stripped-down stat: just the colored number. The label ("crit", "maj")
   * is dropped — the severity-tinted glyph is unambiguous, and the
   * counters in the page header above already include labeled versions. */
  main[data-collapsed="1"] .rail-stat span{ display: none }
  main[data-collapsed="1"] .rail-stat{
    flex-direction: row;
    gap: 0;
  }
  main[data-collapsed="1"] .rail-stat b{
    font-size: var(--t-sm);
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 6%, transparent);
    min-width: 22px;
    text-align: center;
  }
  /* Spinner only when actively running — the desktop CSS hides it when
   * NOT collapsed; here we ALSO need to hide it when the rail-dot reports
   * an idle/done/error state, otherwise it spins permanently in the
   * collapsed header. */
  main[data-collapsed="1"] .rail-spinner{
    margin-top: 0;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  /* Beefier state dot in stacked collapsed — it's the primary visual
   * anchor of the strip (the "what's the status of the review" glance).
   * Desktop keeps the slim 10px version since the column is narrow. */
  main[data-collapsed="1"] .rail-dot{
    width: 12px;
    height: 12px;
  }
  /* Subtle vertical separator between "what I'm reviewing" (branches) and
   * "what I found" (severity counters). Reads more cleanly than a raw
   * flex gap on a busy strip. */
  main[data-collapsed="1"] .rail-stats::before{
    content: '';
    display: inline-block;
    width: 1px;
    height: 14px;
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    margin-right: 8px;
  }
  /* Zero-counts are visual noise on the collapsed header. Hide stats
   * whose number is "0" to let the meaningful counts breathe. */
  main[data-collapsed="1"] .rail-stat:has(b:empty),
  main[data-collapsed="1"] .rail-stat[data-zero="1"]{ display: none }
  /* Toggle button — anchor inside the header strip on the right edge.
   * The desktop "center when collapsed" rule was for a 56px-wide rail
   * column; here the rail is full-width so it just sits flush right.
   * In stacked the collapse direction is vertical, so we swap the
   * chevron glyph to a down/up arrow via the .collapse-btn-down class
   * applied in JS. */
  main[data-collapsed="1"] .collapse-btn{
    top: 50%;
    right: var(--s-2);
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
  }
}

/* High-contrast theme adjustments */
@media (forced-colors: active){
  .verdict{ border: 1px solid CanvasText }
  .sev, .badge, .cat, .counter{ border: 1px solid CanvasText }
  .btn, .filter{ border: 1px solid CanvasText }
  .branch[aria-selected="true"]{ outline: 2px solid Highlight }
}
`;
