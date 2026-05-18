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
  padding: var(--s-2) var(--s-3);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: var(--r-md);
}
.adv-opt--toggle{ cursor: pointer }
.adv-opt--toggle:hover{ background: color-mix(in srgb, var(--fg) 4%, transparent) }
.adv-opt__label{
  display: flex; flex-direction: column; gap: 2px;
  flex: 1; min-width: 0;
}
.adv-opt__name{
  font-size: var(--t-sm);
  font-weight: 500;
  color: var(--fg);
}
.adv-opt__hint{
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  line-height: 1.4;
}
.adv-opt__check{
  flex: 0 0 auto;
  width: 16px; height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
}

/* ─── Segmented control (depth selector) ────────────────────── */
.adv-opt__segmented{
  display: inline-flex;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--fg) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: var(--r-md);
  padding: 2px;
  gap: 2px;
}
.adv-opt__seg{
  background: transparent;
  border: 0;
  padding: 4px 10px;
  font: inherit;
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  cursor: pointer;
  border-radius: calc(var(--r-md) - 2px);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  white-space: nowrap;
}
.adv-opt__seg:hover{
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  color: var(--fg);
}
.adv-opt__seg--active{
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 500;
}
.adv-opt__seg--active:hover{
  background: var(--accent-hover);
  color: var(--accent-fg);
}

/* On narrow panels the depth segmented control wraps below its label so the
 * row doesn't squish or overflow. Triggers when the panel is under ~480px,
 * which lines up with the responsive breakpoint elsewhere. */
@media (max-width: 480px){
  .adv-opt--depth{
    flex-direction: column; align-items: stretch;
  }
  .adv-opt__segmented{ width: 100% }
  .adv-opt__seg{ flex: 1 }
}
`;
