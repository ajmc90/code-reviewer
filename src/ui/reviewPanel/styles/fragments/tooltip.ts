/**
 * Generic rich tooltip — CSS-only, no JavaScript. Modeled after .preset-tip /
 * .pass-tip / .step-tip patterns already in use; consolidated here so any
 * component can opt-in by wrapping its host with `.tip-host` and rendering
 * a `<span class="tip" role="tooltip">...</span>` inside.
 *
 * Usage:
 *   <button class="tip-host">
 *     Label
 *     <span class="tip" role="tooltip">
 *       <span class="tip__title">Heading</span>
 *       <span class="tip__hint">Explanation paragraph.</span>
 *     </span>
 *   </button>
 *
 * Positioning variants:
 *   .tip            → opens below the host (default)
 *   .tip--above     → opens above the host
 *   .tip--start     → aligns left edge with host
 *   .tip--end       → aligns right edge with host
 *   .tip--center    → center-aligns relative to host
 */
export const TOOLTIP_CSS = String.raw`
.tip-host{ position: relative }
.tip{
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
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
  line-height: 1.45;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  display: grid;
  gap: 4px;
  white-space: normal;
}
.tip-host:hover > .tip,
.tip-host:focus-visible > .tip,
.tip-host:focus-within > .tip{
  opacity: 1;
  transform: translateY(0);
}
.tip--above{ top: auto; bottom: calc(100% + 6px); transform: translateY(2px) }
.tip-host:hover > .tip--above,
.tip-host:focus-visible > .tip--above,
.tip-host:focus-within > .tip--above{ transform: translateY(0) }
.tip--end{ left: auto; right: 0 }
.tip--center{ left: 50%; right: auto; transform: translate(-50%, -2px) }
.tip-host:hover > .tip--center,
.tip-host:focus-visible > .tip--center,
.tip-host:focus-within > .tip--center{ transform: translate(-50%, 0) }
.tip__title{ font-weight: 600; color: var(--fg) }
.tip__hint{ color: var(--fg-muted) }
.tip__detail{ color: var(--fg-subtle); font-size: 11px; font-style: italic }
`;
