/**
 * Live timeline — step rows, badges (incl. step-tip rich tooltip), action buttons.
 */
export const TIMELINE_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Timeline (live activity)
 * ────────────────────────────────────────────────────────────── */
.timeline{ display:flex; flex-direction:column; gap:var(--s-1) }
.timeline-empty{ color: var(--fg-subtle); font-size: var(--t-xs); padding: var(--s-1) }
.step{
  display:flex; gap:var(--s-3); align-items:flex-start;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  border: 1px solid transparent;
  min-width: 0;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.step--auto-skipped{ opacity: .7 }
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
.step.running{ border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: var(--accent-tint) }
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
  margin: 0 0 var(--s-2);
  padding: var(--s-3);
  background: color-mix(in srgb, var(--sev-major) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--sev-major) 35%, transparent);
  border-radius: var(--r-md);
  gap: var(--s-3);
  align-items: flex-start;
}
.resume-banner[data-visible="1"]{ display: flex }
.resume-banner .text{ flex:1 1 auto; min-width:0 }
.resume-banner .text h3{ margin: 0 0 4px; font-size: var(--t-sm); color: var(--fg); font-weight: 600 }
.resume-banner .text p{ margin: 0; color: var(--fg-muted); font-size: var(--t-xs); overflow-wrap: anywhere; line-height: var(--lh-normal) }
.resume-banner .actions{ display: flex; gap: var(--s-2); flex-shrink: 0 }
.resume-banner .ico{
  font-size: 18px; line-height: 1; padding-top: 1px; color: var(--sev-major);
}

.step .body{ flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:2px }
.step .label{
  display:flex; align-items:baseline; gap:var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--fg);
}
.step.running .label{ color: var(--accent) }
.step .elapsed{
  margin-left:auto;
  font-size: 10px;
  font-weight: 400;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.step .meta{
  font-size: var(--t-xs);
  color: var(--fg-muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.step .activity{
  font-size: 10px;
  font-family: var(--vscode-editor-font-family);
  color: var(--fg-subtle);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

`;
