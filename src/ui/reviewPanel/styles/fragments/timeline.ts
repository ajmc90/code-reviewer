/**
 * Live timeline — step rows, badges (incl. step-tip rich tooltip), action buttons.
 */
export const TIMELINE_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Timeline (live activity)
 *
 * Each step is its own card — bordered, padded, with a clear header
 * (icon + label + elapsed). Earlier design rendered steps as flat rows
 * which made a long list (8+ passes with metrics + tools) read as one
 * dense block. Cards give the eye a per-pass anchor.
 * ────────────────────────────────────────────────────────────── */
.timeline{ display:flex; flex-direction:column; gap:var(--s-2) }
.timeline-empty{
  color: var(--fg-subtle);
  font-size: var(--t-xs);
  padding: var(--s-3);
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
}
.step{
  display:flex; gap:var(--s-3); align-items:flex-start;
  padding: var(--s-3);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg);
  min-width: 0;
  /* Reserve space below the step when scrollIntoView pins it — the sticky
   * .section--run covers the bottom of the .left scroll container, so a naive
   * scroll would leave the just-started step pinned right under the run-card.
   * The JS sets --run-h on .left at runtime; this fallback handles first paint. */
  scroll-margin-bottom: calc(var(--run-h, 200px) + var(--s-3));
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}
.step:hover{
  border-color: color-mix(in srgb, var(--fg) 18%, var(--border));
}
.step--auto-skipped{ opacity: .65 }
.step--consolidation .ico{ color: var(--accent) }
.step-badge{
  position: relative;
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 6px; padding: 0 6px;
  font-size: 10px; line-height: 16px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.03em;
  border-radius: var(--r-sm);
  cursor: help;
  border: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--fg-subtle);
  outline: none;
}
.step-badge--merged{ color: var(--accent); border-color: var(--accent) }
.step-badge--auto{ color: var(--fg-subtle) }

/* Rich tooltip for step badges — same pattern as .pass-tip. CSS-only. */
.step-tip{
  position: absolute;
  z-index: 20;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  max-width: 320px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: var(--vscode-editorWidget-background, var(--bg));
  border: 1px solid var(--border);
  color: var(--fg);
  font-size: var(--t-xs);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  line-height: 1.45;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  display: grid;
  gap: 4px;
  white-space: normal;
}
.step-badge:hover .step-tip,
.step-badge:focus-visible .step-tip{
  opacity: 1;
  transform: translateY(0);
}
.step-tip__title{ font-weight: 600; color: var(--fg) }
.step-tip__hint{ color: var(--fg-muted) }
.step .ico{
  width: 22px; height: 22px;
  border-radius: 50%;
  display:grid; place-items:center;
  font-size: var(--t-sm);
  font-weight: 700;
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  color: var(--fg);
  flex-shrink: 0;
}
.step.running{
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent) inset;
}
.step.running .ico{ background: var(--accent); color: var(--accent-fg); padding: 0 }

/* Inline SVG spinner — replaces the rotating ◐ character. Two animations
 * combine so the loader looks fluid even when the parent DOM is recreated
 * on every render (the timeline can re-render 10x/sec during streaming):
 *   1. ico-spin     — rotates the whole svg
 *   2. ico-dash     — animates the dashed arc length so the leading edge
 *                     "catches up" with the trailing edge
 * Both run on cubic-bezier easing so the motion never reads as mechanical. */
.ico-spinner{
  width: 16px; height: 16px;
  animation: ico-spin 1.4s linear infinite;
  /* GPU-promote so subpixel rotation stays crisp at all theme zooms. */
  will-change: transform;
}
.ico-spinner__track{
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  opacity: 0.22;
}
.ico-spinner__arc{
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  /* circle of radius 9 ⇒ circumference ≈ 56.5. We animate
   * stroke-dasharray + dashoffset to give the arc a "breathing" length. */
  stroke-dasharray: 56.5;
  stroke-dashoffset: 56.5;
  transform-origin: 50% 50%;
  animation: ico-dash 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes ico-spin{
  to { transform: rotate(360deg) }
}
@keyframes ico-dash{
  /* Long arc grows, then short arc shrinks — the classic Material spinner. */
  0%   { stroke-dashoffset: 53;  transform: rotate(0deg) }
  50%  { stroke-dashoffset: 14;  transform: rotate(135deg) }
  100% { stroke-dashoffset: 53;  transform: rotate(450deg) }
}
.step.done .ico{ background: var(--sev-nit); color: #0a2e1c }
.step.error .ico{ background: var(--sev-critical); color: #fff }
.step.awaitDecision{ border-color: color-mix(in srgb, var(--sev-major) 55%, transparent); background: color-mix(in srgb, var(--sev-major) 10%, transparent) }
.step.awaitDecision .ico{ background: var(--sev-major); color: #1a1100 }
.step.skipped .ico{ background: color-mix(in srgb, var(--fg) 22%, transparent); color: var(--fg-muted) }
.step.skipped .label{ color: var(--fg-muted); text-decoration: line-through }
/* No-op consolidation (merged === 0): we ran, but nothing to do. Visually
 * sits between success (green) and skipped (gray) — informational blue, so
 * it reads as "FYI, ran cleanly" instead of either "did meaningful work" or
 * "didn't run". Specificity bumped via .step.done compound selector so it
 * wins over .step.done .ico (set above).
 *
 * Local var keeps the long fallback chain readable; falls back to a default
 * blue when neither VS Code theme token is exposed. */
.step--noop{ --noop-info: var(--vscode-notificationsInfoIcon-foreground, var(--vscode-charts-blue, #3794ff)) }
.step.done.step--noop .ico{
  background: color-mix(in srgb, var(--noop-info) 22%, transparent);
  color: var(--noop-info);
}
.step--noop .step-badge--merged{
  color: var(--noop-info);
  border-color: color-mix(in srgb, var(--noop-info) 45%, transparent);
}

.step .actions{
  display:flex; gap: var(--s-2); margin-top: 6px; flex-wrap: wrap;
}
.step .actions button{
  display:inline-flex; align-items:center; gap: 4px;
  padding: 3px var(--s-2);
  font: inherit; font-size: var(--t-xs); font-weight: 500;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.step .actions button:hover{ background: color-mix(in srgb, var(--fg) 6%, transparent) }
.step .actions button.primary{ background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight:600 }
.step .actions button.primary:hover{ background: var(--accent-hover) }
.step .actions button.danger{ background: var(--vscode-errorForeground, #d13438); color: #fff; border-color: transparent; font-weight:600 }
.step .actions button.danger:hover{ filter: brightness(1.1) }

.resume-banner{
  display: none;
  margin: 0 0 var(--s-3);
  padding: var(--s-3);
  background: color-mix(in srgb, var(--sev-major) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--sev-major) 30%, transparent);
  border-radius: var(--r-md);
  gap: var(--s-3);
  align-items: flex-start;
}
.resume-banner[data-visible="1"]{ display: flex }
.resume-banner .text{
  flex: 1 1 auto;
  min-width: 0;
  /* Reserve room for the actions on the right at any reasonable panel width.
   * Without this the long branch-name detail line can shove the actions off
   * the right edge or overlap them (which is what produced the screenshot's
   * broken layout). */
  padding-right: var(--s-2);
}
.resume-banner .text h3{ margin: 0 0 4px; font-size: var(--t-sm); color: var(--fg); font-weight: 600; line-height: 1.35 }
.resume-banner .text p{ margin: 0; color: var(--fg-muted); font-size: var(--t-xs); overflow-wrap: anywhere; line-height: var(--lh-normal) }
.resume-banner .actions{
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  flex: 0 0 auto;
  align-items: stretch;
  min-width: 92px;
}
.resume-banner .actions .btn{ justify-content: center }
.resume-banner .ico{
  font-size: 18px; line-height: 1; padding-top: 1px; color: var(--sev-major);
  flex: 0 0 auto;
}

/* On wider panels prefer side-by-side action buttons; stack only when narrow. */
@media (min-width: 520px){
  .resume-banner .actions{ flex-direction: row; min-width: 0 }
}

.step .body{ flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap: 4px }
.step .label{
  display:flex; align-items:center; gap:var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--fg);
  line-height: 1.3;
}
.step.running .label{ color: var(--accent) }
.step .elapsed{
  margin-left:auto;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}
.step.running .elapsed{
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.step .meta{
  font-size: var(--t-xs);
  color: var(--fg-muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
/* Metric-chip row shown under a completed pass. Wraps onto multiple rows on
 * narrow panels instead of overflowing. Sits inside the card with a thin
 * top divider so it reads as "metrics for this pass" rather than as another
 * row in the timeline. */
.step .chips{
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--s-2);
  padding-top: var(--s-2);
  border-top: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
}
.step .chip{
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 2px 8px;
  font-size: 10px;
  line-height: 16px;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  /* Chips carry hover tooltips explaining each metric. cursor:help is the
   * convention for "extra info on hover" without implying click. outline:none
   * because the .tip-host already shows the popover on :focus-visible. */
  cursor: help;
  outline: none;
}
/* Hover/focus accent so users discover the chip is interactive. Subtle —
 * the chip itself is decorative; the value is the headline. */
.step .chip:hover,
.step .chip:focus-visible{
  border-color: color-mix(in srgb, var(--fg) 22%, var(--border));
  background: color-mix(in srgb, var(--fg) 7%, transparent);
}
/* Chip-level tip overrides: opens above the chip (the row sits at the
 * bottom of the card so above keeps it inside the viewport). z-index above
 * sibling chips so a hovered tooltip isn't clipped by a later chip in the
 * same flex row.
 *
 * Width: the panel can be very narrow (~280px) and chips wrap onto a second
 * row that often sits flush to the LEFT edge of the card. With a fixed
 * min-width the popover would push out past the viewport edge and clip
 * (which was the bug in the wrapped-row screenshot). Use min() so the
 * popover never exceeds the viewport width minus the panel's left padding,
 * regardless of which chip is hovered or which row it wrapped onto. */
.step .chip > .tip{
  min-width: 0;
  width: max-content;
  max-width: min(300px, calc(100vw - 48px));
  z-index: 40;
}
.step .chip__k{
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 9px;
  font-weight: 600;
}
.step .chip__v{
  color: var(--fg);
  font-weight: 600;
}
/* Per-kind accents — saturate sparingly so chips don't compete with the
 * pass label. cache hit gets a success tint when high, findings get a
 * subtle severity hint (it's the user's headline number). */
.step .chip--tokens .chip__v{ color: var(--fg) }
.step .chip--cache .chip__v{ color: var(--sev-nit) }
.step .chip--findings{
  background: color-mix(in srgb, var(--sev-major) 10%, transparent);
  border-color: color-mix(in srgb, var(--sev-major) 35%, var(--border));
}
.step .chip--findings .chip__v{ color: var(--sev-major) }

`;
