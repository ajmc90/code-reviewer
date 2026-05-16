/**
 * Change map — per-file kind/blast chips above the findings grid.
 */
export const CHANGE_MAP_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Change map (per-file classification from the explore pass)
 * ────────────────────────────────────────────────────────────── */
.changemap{
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--bg);
  padding: var(--s-3);
  margin-bottom: var(--s-3);
  display: flex; flex-direction: column; gap: var(--s-2);
}
.changemap[hidden]{ display: none }
.changemap__head{
  display: flex; align-items: baseline; gap: var(--s-2);
  cursor: pointer; user-select: none;
}
.changemap__title{ font-weight: 600; font-size: var(--t-sm); margin: 0 }
.changemap__count{ color: var(--fg-subtle); font-size: var(--t-xs) }
.changemap__toggle{
  margin-left: auto; background: transparent; border: 0;
  color: var(--fg-subtle); font-size: var(--t-xs); cursor: pointer;
}
.changemap__list{
  display: flex; flex-wrap: wrap; gap: var(--s-2);
}
.changemap--collapsed .changemap__list{ display: none }
.changemap__chip{
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  background: var(--bg-subtle);
  font-family: var(--vscode-editor-font-family);
  cursor: default;
}
.changemap__chip .file{ color: var(--fg) }
.changemap__chip .kind{
  text-transform: lowercase; color: var(--fg-subtle);
  border-left: 1px solid var(--border); padding-left: 6px;
}
.changemap__chip .blast{
  color: var(--accent); font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.04em;
}
.changemap__chip[data-blast="cross-cutting"] .blast{ color: var(--severity-major, var(--accent)) }
.changemap__chip[data-blast="module"] .blast{ color: var(--accent) }
.changemap__chip[data-blast="local"] .blast{ color: var(--fg-subtle) }

`;
