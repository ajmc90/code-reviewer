/**
 * Cost pill (pre-run estimate) + breakdown popover.
 *
 * The pill lives inside the run-card, between the chips row and the message
 * row. Tone-coded by estimated token count (low/medium/high/very-high)
 * mirroring the costPillTone() heuristic on the client side. Hidden during
 * an in-progress review so it doesn't compete with live progress chips.
 */
export const COST_PILL_CSS = String.raw`
.cost-pill{
  display: inline-flex; align-items: center; gap: 6px;
  align-self: center;
  margin-bottom: var(--s-2);
  padding: 4px 10px;
  font: inherit; font-size: var(--t-xs);
  color: var(--fg-subtle);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.cost-pill:hover{
  background: color-mix(in srgb, var(--fg) 8%, transparent);
}
.cost-pill[aria-busy="true"]{
  opacity: 0.75; cursor: progress;
}
.cost-pill__icon{ font-size: 10px; line-height: 1 }
.cost-pill__val{ font-variant-numeric: tabular-nums }
.cost-pill__hint{ font-size: 9px; opacity: 0.5; margin-left: 2px }
.cost-pill__conf{
  /* Tiny inset badge after the value: communicates whether the estimate
   * is just heuristic or has been calibrated against real runs. Color
   * shifts subtly to telegraph trust level without competing with the
   * tone color of the pill itself. */
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 12%, transparent);
  opacity: 0.85;
  margin-left: 4px;
}
.cost-pill__conf[data-conf="calibrated"]{
  background: color-mix(in srgb, #22c55e 25%, transparent);
  color: color-mix(in srgb, #22c55e 95%, var(--fg));
  opacity: 1;
}
.cost-pill__conf[data-conf="partial"]{
  background: color-mix(in srgb, #3b82f6 22%, transparent);
  color: color-mix(in srgb, #3b82f6 90%, var(--fg));
  opacity: 0.95;
}

/* Tone colors — mirror tokens.ts severity tints to feel consistent. */
.cost-pill[data-tone="low"]{
  color: color-mix(in srgb, #10b981 80%, var(--fg));
  border-color: color-mix(in srgb, #10b981 30%, var(--border));
  background: color-mix(in srgb, #10b981 8%, transparent);
}
.cost-pill[data-tone="medium"]{
  color: color-mix(in srgb, #eab308 80%, var(--fg));
  border-color: color-mix(in srgb, #eab308 30%, var(--border));
  background: color-mix(in srgb, #eab308 8%, transparent);
}
.cost-pill[data-tone="high"]{
  color: color-mix(in srgb, #f97316 80%, var(--fg));
  border-color: color-mix(in srgb, #f97316 35%, var(--border));
  background: color-mix(in srgb, #f97316 10%, transparent);
}
.cost-pill[data-tone="very-high"]{
  color: color-mix(in srgb, #ef4444 85%, var(--fg));
  border-color: color-mix(in srgb, #ef4444 45%, var(--border));
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

/* ─── Breakdown popover ─────────────────────────────────────── */
.run-card{ position: relative }
.cost-breakdown{
  position: absolute; left: var(--s-3); right: var(--s-3); bottom: 100%;
  margin-bottom: var(--s-2);
  z-index: 20;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  padding: var(--s-3);
  font-size: var(--t-xs);
  max-height: 60vh; overflow: auto;
}
/* Variant: open downward instead of upward. Used when the pill is near the
 * top of the viewport and opening upward would clip the popover. */
.cost-breakdown--below{
  bottom: auto; top: 100%;
  margin-bottom: 0; margin-top: var(--s-2);
}
/* Variant: center as a modal-style overlay when neither up nor down has room.
 * Fixed position so it escapes the run-card's bounds; backdrop is implicit
 * via the existing click-outside-to-close handler. */
.cost-breakdown--centered{
  position: fixed; left: 50%; top: 50%;
  bottom: auto; right: auto;
  transform: translate(-50%, -50%);
  width: min(90vw, 480px);
  max-height: 80vh;
  margin: 0;
  box-shadow: 0 16px 48px rgba(0,0,0,0.55);
}
.cost-breakdown__head{
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--s-2);
  font-size: var(--t-sm);
}
.cost-breakdown__close{
  background: transparent; border: 0; color: var(--fg-subtle);
  cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 6px;
  border-radius: var(--r-sm);
}
.cost-breakdown__close:hover{ background: color-mix(in srgb, var(--fg) 8%, transparent) }
.cost-breakdown__table{
  width: 100%; border-collapse: collapse;
  /* table-layout: fixed + explicit per-column widths so the numeric columns
   * stay glued to the right edge instead of floating in the middle. Without
   * fixed layout, the "pass" column expands to fill all available space and
   * leaves the numbers oddly far from the table edge. */
  table-layout: fixed;
  font-variant-numeric: tabular-nums;
}
.cost-breakdown__table col.pass-col{ width: auto }
.cost-breakdown__table col.tok-col{ width: 40% }
.cost-breakdown__table th, .cost-breakdown__table td{
  padding: 4px 6px;
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 60%, transparent);
}
.cost-breakdown__table th{ color: var(--fg-subtle); font-weight: 500; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em }
.cost-breakdown__table th.pass-col-h, .cost-breakdown__table td.pass{ text-align: left }
.cost-breakdown__table th.tok-col-h,
.cost-breakdown__table td.tok{ text-align: right }
.cost-breakdown__table tfoot td{ font-weight: 600; border-bottom: 0 }
.cost-breakdown__range{
  margin-top: var(--s-2);
  color: var(--fg-subtle);
}
.cost-breakdown__factors{
  margin: var(--s-2) 0 0; padding-left: 18px;
  color: var(--fg-subtle);
}
.cost-breakdown__factors li{ margin-bottom: 2px }
.cost-breakdown__disclaimer{
  margin-top: var(--s-3);
  padding: 8px 10px;
  font-size: 10px;
  color: var(--fg-subtle);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  border-radius: var(--r-sm);
  border-left: 3px solid color-mix(in srgb, var(--accent) 50%, transparent);
}

/* ─── Confirmation modal (large runs) ───────────────────────── */
.cost-confirm-overlay{
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  padding: var(--s-3);
  animation: cost-confirm-fade 120ms ease;
}
@keyframes cost-confirm-fade { from { opacity: 0 } to { opacity: 1 } }
.cost-confirm-modal{
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: 0 16px 48px rgba(0,0,0,0.55);
  max-width: 520px; width: 100%;
  max-height: 80vh; overflow: auto;
  display: flex; flex-direction: column;
}
.cost-confirm-modal__head{
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--border);
}
.cost-confirm-modal__title{
  margin: 0; font-size: var(--t-md);
  color: var(--fg);
  display: inline-flex; align-items: center; gap: 8px;
}
.cost-confirm-modal__icon{
  color: color-mix(in srgb, #f97316 85%, var(--fg));
  font-size: 18px;
}
.cost-confirm-modal__close{
  background: transparent; border: 0;
  color: var(--fg-subtle); cursor: pointer;
  font-size: 22px; line-height: 1;
  padding: 4px 8px; border-radius: var(--r-sm);
}
.cost-confirm-modal__close:hover{
  background: color-mix(in srgb, var(--fg) 8%, transparent);
}
.cost-confirm-modal__body{
  padding: var(--s-4);
}
.cost-confirm-modal__headline{
  text-align: center;
  margin-bottom: var(--s-3);
  padding: var(--s-3);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  border-radius: var(--r-md);
}
.cost-confirm-modal__big{
  font-size: 28px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg);
}
.cost-confirm-modal__unit{
  font-size: 14px; font-weight: 400;
  color: var(--fg-subtle);
  margin-left: 4px;
}
.cost-confirm-modal__sub{
  margin-top: 4px;
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}
.cost-confirm-modal__details{
  margin: var(--s-3) 0;
  padding: var(--s-3);
  background: color-mix(in srgb, var(--fg) 3%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: var(--r-md);
}
.cost-confirm-modal__details-title{
  margin: 0 0 var(--s-2);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-subtle);
}
.cost-confirm-modal__diff{
  margin: 0 0 var(--s-2);
  font-size: var(--t-sm);
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.cost-confirm-modal__factors{
  margin: 0;
  padding-left: 18px;
  font-size: var(--t-xs);
  color: var(--fg-subtle);
}
.cost-confirm-modal__factors li{ margin-bottom: 3px; line-height: 1.4 }
.cost-confirm-modal__warn{
  display: flex; align-items: flex-start; gap: 10px;
  margin: var(--s-3) 0;
  padding: 12px 14px;
  font-size: var(--t-xs);
  color: var(--fg);
  background: color-mix(in srgb, #eab308 10%, transparent);
  border-left: 3px solid color-mix(in srgb, #eab308 70%, var(--border));
  border-radius: var(--r-sm);
  line-height: 1.55;
}
.cost-confirm-modal__warn-icon{
  flex: 0 0 auto;
  color: color-mix(in srgb, #eab308 90%, var(--fg));
  font-size: 14px;
  line-height: 1.3;
}
.cost-confirm-modal__suppress{
  display: flex; align-items: center; gap: 8px;
  margin-top: var(--s-3);
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  cursor: pointer;
  user-select: none;
}
.cost-confirm-modal__suppress input{ cursor: pointer; flex: 0 0 auto }
.cost-confirm-modal__actions{
  display: flex; justify-content: flex-end; gap: 8px;
  padding: var(--s-3) var(--s-4);
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
}
`;
