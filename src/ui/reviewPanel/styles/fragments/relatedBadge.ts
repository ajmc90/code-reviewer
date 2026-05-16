/**
 * Related-finding badge — links a 'Related:' card to its referent.
 */
export const RELATED_BADGE_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Related-finding badge
 * ────────────────────────────────────────────────────────────── */
.related-badge{
  display: inline-flex; align-items: center;
  margin-left: 6px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--accent-tint, rgba(0,128,255,0.12));
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--r-sm);
  cursor: pointer;
  text-decoration: none;
}
.related-badge:hover{ background: var(--accent); color: var(--bg) }
.finding--flash{
  animation: finding-flash 1.2s ease-out;
}
@keyframes finding-flash {
  0%   { box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--accent-tint, rgba(0,128,255,0.18)); }
  100% { box-shadow: 0 0 0 0  transparent,    0 0 0 0 transparent; }
}

`;
