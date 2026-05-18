/**
 * Two-pane split (resizable left pane + drag gutter + collapsed rail).
 */
export const TWO_PANE_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Two-pane layout — resizable left pane + drag gutter + collapsible
 * ────────────────────────────────────────────────────────────── */
:root{
  --left-w: 420px;
  --left-min: 280px;
  --left-max: 720px;
  --rail-w: 56px;
  /* Stacked-layout (mobile / narrow) height of the left pane. Defaults to
   * "auto" so the section sizes to its content; once the user drags the
   * horizontal gutter we switch this to a pixel value and persist it. */
  --left-h: auto;
}
main{
  display:grid;
  grid-template-columns: var(--left-w) 6px minmax(0, 1fr);
  min-height: 0;
  transition: grid-template-columns var(--dur-med) var(--ease);
}
main[data-collapsed="1"]{
  grid-template-columns: var(--rail-w) 6px minmax(0, 1fr);
}
.left{
  display:flex; flex-direction:column; gap:var(--s-5);
  overflow-y:auto; overflow-x:hidden;
  padding: var(--s-5);
  background: var(--bg-elev);
  min-width: 0;
  container-type: inline-size;
  container-name: left;
  position: relative;
}
main[data-collapsed="1"] .left{
  padding: var(--s-3) var(--s-2);
  overflow: hidden;
}
main[data-collapsed="1"] .left > .left-full{ display: none }
.left-full{ display:flex; flex-direction:column; gap: var(--s-5) }
.left-rail{ display: none }
main[data-collapsed="1"] .left > .left-rail{ display: flex }

.right{
  overflow:auto;
  /* Top padding intentionally 0: a sticky child (.filters-wrap) needs the
   * scroll viewport's top edge to be at coord 0 so it can fully cover scrolled
   * content behind it. The visual top breathing room is restored via the
   * first child's own padding-top (.summary or .filters-wrap). */
  padding: 0 var(--s-6) var(--s-5);
  min-width: 0;
  container-type: inline-size;
  container-name: right;
}
/* Restore top breathing room as padding/margin on whichever element is the
 * first child of .right, so the sticky filter wrap below it can still pin
 * flush to coord 0 of the scroll viewport. */
.right > .summary{ margin-top: var(--s-5) }
.left::-webkit-scrollbar, .right::-webkit-scrollbar{ width:10px; height:10px }
.left::-webkit-scrollbar-thumb, .right::-webkit-scrollbar-thumb{
  background: color-mix(in srgb, var(--fg) 14%, transparent); border-radius: var(--r-sm);
}

/* Drag gutter between panes */
.gutter{
  position: relative;
  width: 6px;
  cursor: col-resize;
  background: var(--border);
  transition: background var(--dur-fast) var(--ease);
  user-select: none;
  flex-shrink: 0;
  z-index: 5;
}
.gutter::before{
  content: '';
  position: absolute;
  inset: 0 -3px;          /* enlarge hit area */
}
.gutter:hover, .gutter[data-active="1"]{
  background: var(--accent);
}
.gutter::after{
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 2px; height: 32px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--fg) 30%, transparent);
  transition: background var(--dur-fast) var(--ease);
}
.gutter:hover::after, .gutter[data-active="1"]::after{ background: var(--accent-fg) }
main[data-resizing="1"]{ transition: none; cursor: col-resize }
main[data-resizing="1"] *{ user-select: none !important; pointer-events: none }
main[data-resizing="1"] .gutter{ pointer-events: auto }

/* Left collapse toggle button */
.collapse-btn{
  position: absolute;
  top: var(--s-3);
  right: var(--s-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  z-index: 4;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.collapse-btn:hover{ background: var(--accent-tint); color: var(--fg) }
main[data-collapsed="1"] .collapse-btn{
  right: 50%; transform: translateX(50%);
}

/* Mini rail (visible when left is collapsed) */
.left-rail{
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  padding-top: var(--s-7);
  width: 100%;
}
.rail-dot{
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--fg-subtle);
  flex-shrink: 0;
}
.rail-dot[data-state="running"]{ background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: pulse 1.6s ease-in-out infinite }
.rail-dot[data-state="done"]    { background: var(--sev-nit) }
.rail-dot[data-state="error"]   { background: var(--sev-critical) }

.rail-vert{
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: var(--t-xs);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--fg-muted);
  white-space: nowrap;
  max-height: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail-stats{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: var(--s-3);
  font-variant-numeric: tabular-nums;
}
.rail-stat{
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  color: var(--fg-muted);
  line-height: 1.1;
}
.rail-stat b{ font-size: var(--t-md); color: var(--fg); font-weight: 600 }
.rail-stat[data-sev="critical"] b{ color: var(--sev-critical) }
.rail-stat[data-sev="major"]    b{ color: var(--sev-major) }
.rail-stat[data-sev="minor"]    b{ color: var(--sev-minor) }
.rail-stat[data-sev="nit"]      b{ color: var(--sev-nit) }

.rail-spinner{
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
  margin-top: var(--s-3);
}
main:not([data-collapsed="1"]) .rail-spinner{ display:none }
/* Only spin when a review is actually running. The CSS hook is the
 * data-state attribute on the sibling .rail-dot, which renderRail() sets
 * to 'running' / 'done' / 'error' / 'idle'. Using :has() keeps the
 * spinner declarative — no extra JS toggle. */
.left-rail:not(:has(.rail-dot[data-state="running"])) .rail-spinner{ display: none }

`;
