/**
 * Advanced Options panel styles — segmented control for depth, toggles for
 * boolean settings. Lives inside .advanced-pane (already shown/hidden by the
 * existing #btn-toggle-advanced).
 */
export const ADVANCED_OPTIONS_CSS = String.raw`
.adv-opts{
  display: flex; flex-direction: column; gap: var(--s-2);
  margin-top: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px dashed color-mix(in srgb, var(--border) 60%, transparent);
}

.adv-opt{
  display: flex; align-items: center; justify-content: space-between; gap: var(--s-3);
  padding: var(--s-3);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: var(--r-md);
}
.adv-opt--toggle{ cursor: pointer }
.adv-opt--toggle:hover{ background: color-mix(in srgb, var(--fg) 4%, transparent) }
.adv-opt__label{
  display: flex; flex-direction: column; gap: 3px;
  flex: 1; min-width: 0;
}
.adv-opt__name{
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--fg);
  line-height: 1.3;
}
.adv-opt__hint{
  font-size: var(--t-xs);
  color: var(--fg-muted);
  line-height: 1.45;
}
.adv-opt__check{
  flex: 0 0 auto;
  width: 16px; height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
}

/* ─── Depth row: stacked layout ─────────────────────────────────
 * The depth control has a longer hint than the toggles ("How thoroughly each
 * pass thinks. Higher depth = more findings + more cost.") and 4 segmented
 * options that are wider than a single checkbox. Putting them on the same row
 * squeezes the label into a 2-words-per-line column.
 *
 * Stacking unconditionally — label on top, full-width segmented below — gives
 * both elements room to breathe and aligns each segment with equal width so
 * the control reads as a unified scale (Fast → Obsessive). */
.adv-opt--depth{
  flex-direction: column;
  align-items: stretch;
  gap: var(--s-2);
}

/* ─── Segmented control (depth selector) ────────────────────── */
.adv-opt__segmented{
  display: flex;
  width: 100%;
  background: color-mix(in srgb, var(--fg) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: var(--r-md);
  padding: 2px;
  gap: 2px;
}
.adv-opt__seg{
  flex: 1 1 0;
  background: transparent;
  border: 0;
  padding: 6px 8px;
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--fg-muted);
  cursor: pointer;
  border-radius: calc(var(--r-md) - 3px);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  text-align: center;
  min-width: 0;
}
.adv-opt__seg:hover{
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg);
}
.adv-opt__seg:focus-visible{
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.adv-opt__seg--active{
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0,0,0,.12);
}
.adv-opt__seg--active:hover{
  background: var(--accent-hover);
  color: var(--accent-fg);
}

/* On the narrowest panels even the stacked segmented can run out of room for
 * 4 options × ~70px. Drop the font-size a hair so "Obsessive" fits. Container
 * query targets the .right pane width (the .left pane never hosts this UI). */
@container left (max-width: 360px){
  .adv-opt__seg{ font-size: 11px; padding: 5px 4px }
}
`;
