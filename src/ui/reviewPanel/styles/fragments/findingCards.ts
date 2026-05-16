/**
 * Finding cards — header, body grid, fix block, actions row, sev/severity coloring.
 */
export const FINDING_CARDS_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Finding cards
 * ────────────────────────────────────────────────────────────── */
.findings{ display:flex; flex-direction:column; gap: var(--s-3) }
.finding{
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--bg);
  overflow: hidden;
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.finding:hover{ border-color: var(--border-strong) }
.finding[data-severity="critical"]{ border-left: 3px solid var(--sev-critical) }
.finding[data-severity="major"]   { border-left: 3px solid var(--sev-major) }
.finding[data-severity="minor"]   { border-left: 3px solid var(--sev-minor) }
.finding[data-severity="nit"]     { border-left: 3px solid var(--sev-nit) }
.finding[data-severity="praise"]  { border-left: 3px solid var(--sev-praise) }
.finding[data-severity="silenced"]{ border-left: 3px dashed var(--sev-silenced) }

.finding-head{
  display:flex; align-items:center; gap: var(--s-2);
  width:100%;
  padding: var(--s-3);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: background var(--dur-fast) var(--ease);
}
.finding-head:hover{ background: color-mix(in srgb, var(--fg) 4%, transparent) }
.chevron{
  flex-shrink:0;
  width: 14px;
  color: var(--fg-muted);
  transition: transform var(--dur-fast) var(--ease);
}
.finding[aria-expanded="true"] .chevron{ transform: rotate(90deg) }

.sev{
  padding: 2px var(--s-2);
  border-radius: var(--r-sm);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  color: #fff;
  flex-shrink: 0;
  text-transform: uppercase;
}
.sev[data-sev="critical"]{ background: var(--sev-critical) }
.sev[data-sev="major"]   { background: var(--sev-major); color:#1a1a1a }
.sev[data-sev="minor"]   { background: var(--sev-minor) }
.sev[data-sev="nit"]     { background: var(--sev-nit); color:#0a2e1c }
.sev[data-sev="praise"]  { background: var(--sev-praise) }
.sev[data-sev="silenced"]{ background: var(--sev-silenced); color: #1a1a1a }

/* Silenced finding card visuals — muted but still legible. The card stays
   visible (the whole point: user knows it came back) but signals that this
   is a known/dismissed pattern, not new noise. */
.finding[data-severity="silenced"]{
  opacity: .72;
  border-style: dashed;
}
.finding[data-severity="silenced"]:hover{ opacity: 1 }
.silenced-badge{
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 6px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .04em;
  background: color-mix(in srgb, var(--sev-silenced) 22%, transparent);
  color: var(--fg-muted);
  border: 1px solid color-mix(in srgb, var(--sev-silenced) 45%, transparent);
  border-radius: var(--r-sm);
  cursor: help;
}

/* Filter button variant for silenced — keeps the filter row visually muted
   so the "real" severities still dominate. */
.filter--silenced{
  opacity: .75;
  font-style: italic;
}
.filter--silenced:hover, .filter--silenced[aria-pressed="true"]{ opacity: 1; font-style: normal }

.cat{
  font-size: 10px;
  padding: 2px var(--s-2);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
  flex-shrink: 0;
  text-transform: lowercase;
}
.title{
  flex:1;
  font-size: var(--t-md);
  font-weight: 500;
  min-width: 0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.loc{
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px var(--s-1);
  border-radius: var(--r-sm);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.loc:hover{ color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent) }
.conf{
  font-size: 10px;
  color: var(--fg-subtle);
  text-transform: lowercase;
  flex-shrink: 0;
}

.finding-body{ display:none; border-top: 1px solid var(--border) }
.finding[aria-expanded="true"] .finding-body{ display:block }

.grid2{
  display:grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  gap: 0;
}
.col{ padding: var(--s-4); min-width:0 }
.col + .col{
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 3%, transparent);
}
.col h4{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
  display:flex; align-items:center; gap:var(--s-1);
}
.col h4 + h4{ margin-top: var(--s-3) }
.col p{ margin: 0 0 var(--s-2); line-height: var(--lh-loose); font-size: var(--t-md) }
.col .qa{ margin: var(--s-1) 0 var(--s-2); padding-left: var(--s-4) }
.col .qa li{ margin-bottom: 4px; color: var(--fg-muted); line-height: var(--lh-normal) }

.evidence{
  background: var(--bg-code);
  border-left: 3px solid var(--accent);
  padding: var(--s-2) var(--s-3);
  margin: var(--s-1) 0;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  line-height: 1.55;
  white-space: pre-wrap;
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  overflow-x: auto;
}
.fix{
  display: block;
  background: var(--bg-code);
  padding: var(--s-3);
  border-radius: var(--r-md);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-sm);
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
  margin: var(--s-1) 0 var(--s-2);
}
.fix-conf{ font-size: 10px; color: var(--fg-subtle) }

.actions{
  padding: var(--s-2) var(--s-3);
  border-top: 1px solid var(--border);
  display:flex; gap:var(--s-1); flex-wrap:wrap;
  background: color-mix(in srgb, var(--fg) 2%, transparent);
}

/* ─── Critique decision UI (cards under the "Revised" filter chip) ─────
   Three variants, all derived from data-decision on the .finding wrapper:
     drop    — finding judged not load-bearing; collapsed-only, struck title.
     merge   — folded into another; collapsed-only, points to survivor.
     revise  — kept but mutated; expandable detail diffs against the original.
   All three render greyed-out so the user immediately reads them as "audit
   trail" instead of mistaking them for new findings. */
.finding--decision{
  opacity: .68;
  border-style: dashed;
}
.finding--decision:hover{ opacity: 1 }
.finding--decision-drop .finding-head .title,
.finding--decision-merge .finding-head .title{
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--fg) 35%, transparent);
}
.decision-badge{
  display: inline-flex; align-items: center;
  margin-left: 6px; padding: 1px 6px;
  font-size: 10px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  cursor: help;
  flex-shrink: 0;
}
.decision-badge--drop{
  background: color-mix(in srgb, var(--sev-critical) 14%, transparent);
  color: color-mix(in srgb, var(--sev-critical) 78%, var(--fg) 22%);
  border-color: color-mix(in srgb, var(--sev-critical) 35%, transparent);
}
.decision-badge--merge{
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: color-mix(in srgb, var(--accent) 78%, var(--fg) 22%);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}
.decision-badge--revise{
  background: color-mix(in srgb, var(--sev-major) 14%, transparent);
  color: color-mix(in srgb, var(--sev-major) 78%, var(--fg) 22%);
  border-color: color-mix(in srgb, var(--sev-major) 35%, transparent);
}
/* The "Self-critique's review" expandable section lives inside
   .finding-body between the two-column grid and .actions. The labeled
   header makes its purpose unambiguous when the card is open — without it,
   a stray h4 stack would blend into the rest of the body. */
.decision-detail{
  padding: 0;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.decision-detail__head{
  display: flex; align-items: center; gap: var(--s-2);
  padding: var(--s-2) var(--s-4);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
.decision-detail__icon{
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  font-size: 12px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--fg);
}
.decision-detail[data-decision="drop"] .decision-detail__icon{
  background: color-mix(in srgb, var(--sev-critical) 18%, transparent);
  color: color-mix(in srgb, var(--sev-critical) 80%, var(--fg) 20%);
}
.decision-detail[data-decision="merge"] .decision-detail__icon{
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.decision-detail[data-decision="revise"] .decision-detail__icon{
  background: color-mix(in srgb, var(--sev-major) 18%, transparent);
  color: color-mix(in srgb, var(--sev-major) 80%, var(--fg) 20%);
}
.decision-detail__title{
  font-size: var(--t-xs); font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase;
  color: var(--fg-muted);
}
.decision-detail__body{ padding: var(--s-4) }
.decision-detail__body h4{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs); font-weight: 600;
  letter-spacing: .08em; text-transform: uppercase;
  color: var(--fg-muted);
  display:flex; align-items:center; gap:var(--s-1);
}
.decision-detail__body h4 + h4,
.decision-detail__body h4 + .decision-changed + h4{ margin-top: var(--s-3) }
.decision-reason{
  margin: 0 0 var(--s-3);
  line-height: var(--lh-loose);
  font-size: var(--t-md);
  font-style: italic;
  color: var(--fg);
}
.decision-changed{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  color: var(--fg-muted);
}
.decision-original{
  margin: 0 0 var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-left: 3px solid var(--fg-subtle);
  background: var(--bg-code);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}
.decision-original__head{
  display:flex; align-items:center; gap: var(--s-2);
  margin-bottom: var(--s-2);
}
.decision-original p{ margin: 0 0 var(--s-1); font-size: var(--t-sm); line-height: var(--lh-loose) }
.decision-from-pass{
  margin: var(--s-1) 0 0;
  font-size: var(--t-xs);
  color: var(--fg-subtle);
}

/* Section divider that splits the main severity flow from the audit-trail
   asides (silenced + revised). Only emitted when filter=all and the group
   has rows. The label centers across the row with a thin hairline on either
   side — quiet enough not to compete with cards, structural enough that the
   user reads what follows as "different" from the list above. */
.findings-divider{
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--s-3);
  margin: var(--s-5) 0 var(--s-3);
  padding: 0 var(--s-3);
  /* The dividers are siblings to .finding cards, which sit in #findings.
     Keep them above the cards visually without a separate flex container. */
}
.findings-divider__line{
  height: 1px;
  background: linear-gradient(
    to right,
    transparent 0%,
    var(--border) 40%,
    var(--border) 60%,
    transparent 100%
  );
}
.findings-divider__label{
  display: inline-flex; align-items: center; gap: var(--s-2);
  padding: 0 var(--s-3);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.findings-divider__title{ color: var(--fg-muted) }
.findings-divider__count{
  display: inline-block;
  min-width: 18px; padding: 0 6px;
  text-align: center;
  font-size: 10px; font-weight: 700;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
  border-radius: 10px;
  letter-spacing: 0; text-transform: none;
}
.findings-divider__hint{
  font-size: 11px;
  color: var(--fg-subtle);
  cursor: help;
  letter-spacing: 0; text-transform: none;
}
/* Faint tone variants so the user reads the difference between the two
   aside groups at a glance (silenced = user's own dismissal; revised =
   critique's audit). Borders/text keep the dim treatment; only the count
   pill picks up a hint of color. */
.findings-divider--silenced .findings-divider__count{
  background: color-mix(in srgb, var(--sev-silenced, var(--fg)) 20%, transparent);
}
.findings-divider--revised .findings-divider__count{
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--fg);
}

/* Filter chip variant for "Revisados". Same muted treatment as Silenced so
   the row reads as audit-trail filters rather than primary severities. */
.filter--revised{
  opacity: .75;
  font-style: italic;
}
.filter--revised:hover, .filter--revised[aria-pressed="true"]{ opacity: 1; font-style: normal }
.filter__count{
  display: inline-block;
  margin-left: 4px; padding: 0 5px;
  font-size: 10px; font-weight: 600;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--fg);
  border-radius: 10px;
  min-width: 14px; text-align: center;
}

.empty-state{
  padding: var(--s-8) var(--s-5);
  text-align: center;
  color: var(--fg-subtle);
  font-size: var(--t-md);
  line-height: var(--lh-loose);
}
.empty-state kbd{
  display: inline-block;
  padding: 1px var(--s-1);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  color: var(--fg);
  background: var(--bg-inset);
}

`;
