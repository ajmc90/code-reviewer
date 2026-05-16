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
