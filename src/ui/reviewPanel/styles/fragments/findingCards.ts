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
  border-radius: var(--r-xl);
  background: var(--bg);
  overflow: hidden;
  transition:
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-med) var(--ease),
    transform var(--dur-med) var(--ease);
}
.finding:hover{
  border-color: var(--border-strong);
  box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.10);
}
.finding[data-severity="critical"]{ border-left: 3px solid var(--sev-critical) }
.finding[data-severity="major"]   { border-left: 3px solid var(--sev-major) }
.finding[data-severity="minor"]   { border-left: 3px solid var(--sev-minor) }
.finding[data-severity="nit"]     { border-left: 3px solid var(--sev-nit) }
.finding[data-severity="praise"]  { border-left: 3px solid var(--sev-praise) }
.finding[data-severity="silenced"]{ border-left: 3px dashed var(--sev-silenced) }

.finding-head{
  display:flex; flex-direction: column;
  width:100%;
  padding: var(--s-3) var(--s-3) var(--s-2);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: background var(--dur-fast) var(--ease);
}
.finding-head:hover{ background: color-mix(in srgb, var(--fg) 4%, transparent) }
/* Two stacked rows: primary (sev pill, title, path) carries the weight;
   meta (category, confidence, translate chip) sits as a quieter strip below. */
.finding-head__row{
  display: flex; align-items: center; gap: var(--s-2);
  min-width: 0;
  overflow: hidden;
}
.finding-head__row--meta{
  margin-top: 6px;
  font-size: var(--t-xs);
}
.finding-head__spacer{ flex: 1 }
/* Typographic middle-dot between meta items (category · confidence · path)
   so they read as discrete chips. A hairline rule competed with the small
   text; a dot at the same color sinks back into the strip. */
.meta-sep{
  display: inline-block;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fg) 22%, transparent);
  flex-shrink: 0;
  align-self: center;
}
/* Path is now part of the meta strip. Filename + line range always stay
   visible; the directory is the only part that truncates with an ellipsis
   when the path is too long. Layout uses three flex children with controlled
   shrink so the right side (file + lines) is protected. */
.loc-path{
  display: inline-flex; align-items: baseline;
  min-width: 0; flex: 0 1 auto;
  max-width: 100%;
  margin-left: auto;
  padding: 2px var(--s-1);
  border-radius: var(--r-sm);
  border: 0;
  background: transparent;
  cursor: pointer;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  text-decoration: none;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
  white-space: nowrap;
}
.loc-path__dir{
  color: var(--fg-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 0 1 auto;          /* dir is the only segment allowed to shrink */
}
.loc-path__file{ color: var(--fg); font-weight: 600; flex: 0 0 auto }
.loc-path__lines{ color: var(--fg-subtle); flex: 0 0 auto }
.loc-path:hover,
.loc-path:focus-visible{
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  outline: none;
}
.loc-path:hover .loc-path__file,
.loc-path:focus-visible .loc-path__file,
.loc-path:hover .loc-path__dir,
.loc-path:focus-visible .loc-path__dir,
.loc-path:hover .loc-path__lines,
.loc-path:focus-visible .loc-path__lines{ color: inherit }
.chevron{
  flex-shrink:0;
  width: 18px; height: 18px;
  padding: 2px;
  border-radius: var(--r-sm);
  color: var(--fg-muted);
  transition:
    transform var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.finding-head:hover .chevron{
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
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

/* Outline variant — used inside finding cards where the colored left-stripe
   already carries the severity color. Solid chip + stripe was screaming the
   same signal twice; outline keeps the chip readable as a LABEL while
   ceding the color cue to the stripe. */
.sev--outline[data-sev]{
  background: transparent;
}
.sev--outline[data-sev="critical"]{ color: var(--sev-critical); border: 1px solid color-mix(in srgb, var(--sev-critical) 55%, transparent) }
.sev--outline[data-sev="major"]   { color: color-mix(in srgb, var(--sev-major) 90%, var(--fg) 10%); border: 1px solid color-mix(in srgb, var(--sev-major) 55%, transparent) }
.sev--outline[data-sev="minor"]   { color: var(--sev-minor); border: 1px solid color-mix(in srgb, var(--sev-minor) 55%, transparent) }
.sev--outline[data-sev="nit"]     { color: color-mix(in srgb, var(--sev-nit) 90%, var(--fg) 10%); border: 1px solid color-mix(in srgb, var(--sev-nit) 55%, transparent) }
.sev--outline[data-sev="praise"]  { color: var(--sev-praise); border: 1px solid color-mix(in srgb, var(--sev-praise) 55%, transparent) }
.sev--outline[data-sev="silenced"]{ color: var(--fg-muted); border: 1px solid color-mix(in srgb, var(--sev-silenced) 55%, transparent) }

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
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  color: var(--fg-muted);
  flex-shrink: 0;
  text-transform: lowercase;
}
.title{
  flex:1;
  font-size: var(--t-lg);
  font-weight: 600;
  color: var(--fg);
  min-width: 0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  letter-spacing: -0.005em;
  line-height: 1.35;
}
.loc{
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px var(--s-1);
  border-radius: var(--r-sm);
  flex-shrink: 0;
  margin-left: auto;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.loc:hover{ color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent) }
/* Confidence reads ambiguously next to severity (both look like labels). The
   "Confidence" prefix makes the relationship explicit; the value stays bold
   so the eye can still glance the level (high/medium/low). */
.conf{
  font-size: var(--t-xs);
  color: var(--fg-muted);
  text-transform: lowercase;
  flex-shrink: 0;
  display: inline-flex; align-items: baseline; gap: 4px;
}
.conf__label{ color: var(--fg-subtle); text-transform: none; letter-spacing: 0 }

.finding-body{ display:none; border-top: 1px solid var(--border) }
.finding[aria-expanded="true"] .finding-body{ display:block }

/* Single-column body flow. Each finding section is its own row stacked top
   to bottom in the order the renderer pushes them: Problem → Reasoning →
   Solution → Open questions → Alternatives → Evidence → Related files.
   Sections get a generous gap so section headers feel like dividers, not
   crowded captions. */
.fb-flow{ padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3) }
.fb-section{ min-width: 0 }
.fb-section p{ margin: 0 0 var(--s-1); line-height: var(--lh-loose); font-size: var(--t-md) }
.fb-section p:last-child{ margin-bottom: 0 }
.fb-section .qa{ margin: var(--s-1) 0 0; padding-left: var(--s-4) }
.fb-section .qa li{ margin-bottom: 4px; color: var(--fg-muted); line-height: var(--lh-normal) }

/* Open-questions list — each prompt rendered as a distinct item with a "?"
   mark and a left border, so the eye reads them as actionable prompts the
   user might want to answer rather than generic bulleted prose. */
.qa-list,
.alt-list{
  margin: var(--s-1) 0 0;
  padding: 0;
  list-style: none;
  display: flex; flex-direction: column;
  gap: 6px;
}
.qa-list__item,
.alt-list__item{
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: start;
  gap: var(--s-2);
  padding: 6px var(--s-2) 6px var(--s-2);
  border-left: 2px solid color-mix(in srgb, var(--fg) 12%, transparent);
  background: color-mix(in srgb, var(--fg) 2%, transparent);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--t-md);
  line-height: var(--lh-normal);
}
.qa-list__mark{
  font-family: var(--vscode-editor-font-family);
  font-weight: 700;
  font-size: var(--t-sm);
  color: color-mix(in srgb, var(--sev-major) 70%, var(--fg-muted) 30%);
  line-height: 1.4;
}
.alt-list__mark{
  font-family: var(--vscode-editor-font-family);
  font-weight: 600;
  font-size: var(--t-md);
  color: var(--fg-subtle);
  line-height: 1.4;
}
.qa-list__text,
.alt-list__text{
  color: var(--fg);
  min-width: 0;
}

/* Section header — emoji-free. The thin accent rule on the left provides the
   visual anchor the icons used to carry; small-caps + medium-weight keeps the
   label calm so the prose underneath stays the focus.

   The accent bar is neutral by default so the body doesn't echo the card's
   severity color into every section header (which created a wall of red on
   critical findings). Only the first section's bar picks up the severity
   tone, just enough to tie the body back to the head. */
/* Two-tier section header system.
   tier 1 (lead) — Problem + Solution. These are the headline sections every
   card has; bold uppercase + accent bar establishes them as the spine.
   tier 2 (sub)  — Reasoning, Open questions, Alternatives, Evidence,
   Related files. Sentence-case, lighter weight, no bar. They read as
   commentary on tier 1, not as equal-rank chapter headings. */
.section-h{
  margin: 0 0 6px;
  display:flex; align-items:center; gap:var(--s-2);
  line-height: 1.2;
  color: var(--fg);
}
.section-h--lead{
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding-left: var(--s-2);
  border-left: 2px solid color-mix(in srgb, var(--fg) 28%, transparent);
}
/* Tier-2 headers (Reasoning / Open questions / Alternatives / Evidence /
   Related files) use the same typographic + accent-bar treatment as the lead
   headers, including the same foreground color — so the whole section spine
   reads as one consistent system. The slightly lighter bar (16% vs 28%)
   preserves a faint lead/sub hierarchy without breaking the visual family. */
.section-h--sub{
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding-left: var(--s-2);
  border-left: 2px solid color-mix(in srgb, var(--fg) 16%, transparent);
  color: var(--fg);
}
.section-h--with-meta{
  justify-content: space-between;
  flex-wrap: wrap;
  row-gap: 4px;
}
.section-h--with-meta > span:first-child{ flex: 1 1 auto; min-width: 0 }
/* Inline variant used inside a <summary> — drops block-level margins so it
   sits flush with the disclosure chevron. Border-left is dropped because the
   chevron already serves as the left visual anchor; padding-left collapses
   so the label sits next to the chevron. */
.section-h--inline{
  margin: 0;
  padding-left: 0;
  border-left: 0;
}
/* The card's outer border-left already carries the severity color across
   the whole left edge — tinting the first section-h on top of it just
   stacks two parallel bars. Keep every section-h neutral; the body→head
   color relationship is already implicit. */

/* fix-confidence inline metric — reads as a comma-after-clause on the
   Solution prose. The leading dot adds a beat of separation without
   resorting to a chip. Tone-mapped via data-conf. */
.fix-conf-inline{
  display: inline;
  font-size: var(--t-sm);
  color: var(--fg-subtle);
}
.fix-conf-inline__sep{ margin: 0 6px; opacity: .55 }
.fix-conf-inline__label{ font-size: var(--t-xs); letter-spacing: .02em }
.fix-conf-inline__value{ font-weight: 700; font-size: var(--t-xs) }
.fix-conf-inline[data-conf="high"]{ color: color-mix(in srgb, var(--sev-nit) 70%, var(--fg) 30%) }
.fix-conf-inline[data-conf="medium"]{ color: color-mix(in srgb, var(--sev-major) 75%, var(--fg) 25%) }
.fix-conf-inline[data-conf="low"]{ color: color-mix(in srgb, var(--sev-critical) 70%, var(--fg) 30%) }
.fix-conf-only{ color: var(--fg-subtle); margin: 0 0 var(--s-2) }
.fix-conf-only .fix-conf-inline__sep{ display: none }

/* Code blocks (Solution + Evidence) share a single container. Each line is
   a 3-column grid: line-number gutter (user-select:none — never copied)
   · marker gutter via ::before (also non-selectable) · code text. This
   guarantees a Copy-button click yields clean source — no diff prefixes,
   no line numbers — pasted into another editor. */
.code-block{
  position: relative;
  background: var(--bg-code);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: var(--r-md);
  margin: var(--s-1) 0 0;
  overflow: hidden;
}
.code-block + .code-block{ margin-top: var(--s-2) }
.code-block__head{
  position: absolute;
  top: 4px; right: 6px;
  display: flex; align-items: center;
  gap: 4px;
  z-index: 2;
}
/* Copy-to-clipboard button — sits next to the lang chip. Hidden until the
   user hovers/focuses the code-block (kept out of the visual noise when
   the user is just reading); always shown to keyboard users for
   discoverability. */
.code-block__copy{
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 22px;
  padding: 0;
  background: var(--bg-code);
  color: var(--fg-subtle);
  border: 1px solid color-mix(in srgb, var(--fg) 14%, transparent);
  border-radius: var(--r-sm);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-2px);
  transition:
    opacity var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.code-block:hover .code-block__copy,
.code-block__copy:focus-visible{
  opacity: 1;
  transform: translateY(0);
}
.code-block__copy:hover{
  color: var(--fg);
  background: var(--bg);
  border-color: color-mix(in srgb, var(--fg) 20%, transparent);
}
.code-block__copy.is-done{
  opacity: 1;
  color: color-mix(in srgb, var(--sev-nit) 90%, var(--fg) 10%);
  border-color: color-mix(in srgb, var(--sev-nit) 45%, transparent);
  background: color-mix(in srgb, var(--sev-nit) 12%, transparent);
}
.code-block__copy-icon{ width: 12px; height: 12px }
.code-block__copy-icon--done{ display: none }
.code-block__copy.is-done .code-block__copy-icon--idle{ display: none }
.code-block__copy.is-done .code-block__copy-icon--done{ display: inline-block }
/* The <template> stays in the DOM but renders nothing — the JS reads its
   innerHTML on copy-button click. */
.code-block__copy-src{ display: none }

/* Card-level "Copy whole finding" button — top-right of the expanded card.
   Hidden while the card is collapsed so the strip stays uncluttered; fades in
   when aria-expanded="true". Visual language matches .code-block__copy
   (square icon button, soft border, success-tinted "done" state) so the two
   copy affordances read as siblings rather than as unrelated controls. */
.finding-copy{
  appearance: none;
  display: none;
  align-items: center; justify-content: center;
  width: 24px; height: 22px;
  margin-left: var(--s-1);
  padding: 0;
  background: transparent;
  color: var(--fg-subtle);
  border: 1px solid color-mix(in srgb, var(--fg) 14%, transparent);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.finding[aria-expanded="true"] .finding-copy{ display: inline-flex }
.finding-copy:hover{
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  border-color: color-mix(in srgb, var(--fg) 22%, transparent);
}
.finding-copy:focus-visible{
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.finding-copy.is-done{
  color: color-mix(in srgb, var(--sev-nit) 90%, var(--fg) 10%);
  border-color: color-mix(in srgb, var(--sev-nit) 45%, transparent);
  background: color-mix(in srgb, var(--sev-nit) 12%, transparent);
}
.finding-copy__icon{ width: 12px; height: 12px }
.finding-copy__icon--done{ display: none }
.finding-copy.is-done .finding-copy__icon--idle{ display: none }
.finding-copy.is-done .finding-copy__icon--done{ display: inline-block }
/* Lang chip is intentionally subtle by default — it's metadata, not the
   point of the block. Sits over diff-tinted lines (add/del) so it needs a
   solid background to stay legible; using the code-block bg variable
   masks the tinted line underneath rather than blending with it. */
.code-block__lang{
  display: inline-flex; align-items: center;
  padding: 1px 6px;
  font-family: var(--vscode-editor-font-family);
  font-size: 10px; font-weight: 500;
  letter-spacing: .04em; text-transform: lowercase;
  color: var(--fg-muted);
  background: var(--bg-code);
  border: 1px solid color-mix(in srgb, var(--fg) 14%, transparent);
  border-radius: var(--r-sm);
  pointer-events: auto;
  opacity: .75;
  transition: opacity var(--dur-fast) var(--ease);
}
.code-block:hover .code-block__lang{ opacity: 1 }
.code-block pre{
  margin: 0;
  /* Per-line grid handles its own padding now. Outer <pre> only reserves
     a little room on top + right for the head strip (lang + copy) which is
     absolutely positioned and only fully visible on hover. */
  padding: var(--s-2) 0 var(--s-2) 0;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-sm);
  line-height: 1.55;
  overflow-x: auto;
  tab-size: 2;
}
.code-block--evidence pre{
  font-size: var(--t-xs);
  line-height: 1.5;
}
/* Fix block doesn't have per-line markup yet — wrap its single line so
   long signatures fold instead of clipping. */
.code-block--fix pre{
  padding: var(--s-3);
  white-space: pre-wrap;
  word-break: break-word;
}
.code-block--fix .code-line{ display: block; padding: 0 }
.code-block--fix .code-line__text{ white-space: pre-wrap; word-break: break-word }
/* Per-line grid: [line# gutter] [marker via ::before] [code text].
   Both the line# and the marker are CSS-only (line# via .code-line__num
   with user-select:none, marker via ::before content which is never part
   of selection). So when the user selects the block, only .code-line__text
   ends up in the clipboard — clean source, no diff prefixes, no numbers.
   This is the answer to "copy brings garbage". */
.code-line{
  display: grid;
  grid-template-columns: 36px 14px 1fr;
  align-items: baseline;
  min-height: 1.5em;
  padding: 0;
}
.code-line__num{
  user-select: none;
  -webkit-user-select: none;
  text-align: right;
  padding-right: var(--s-1);
  color: color-mix(in srgb, var(--fg) 32%, transparent);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}
.code-line__text{
  padding: 0 var(--s-3) 0 var(--s-2);
  white-space: pre;
  min-width: 0;
}
.code-line--add .code-line__text,
.code-line--del .code-line__text{ white-space: pre }
/* Marker column — +/-/blank rendered via ::before so it never enters copy. */
.code-line::before{
  user-select: none;
  -webkit-user-select: none;
  text-align: center;
  padding: 0 4px;
  font-weight: 700;
  color: transparent;
}
.code-line--add::before{ content: '+'; color: color-mix(in srgb, var(--sev-nit) 80%, transparent) }
.code-line--del::before{ content: '−'; color: color-mix(in srgb, var(--sev-critical) 75%, transparent) }
.code-line--ctx::before{ content: ''; }
.code-line--hunk::before{ content: '@'; color: var(--fg-subtle); font-weight: 500 }
/* Line tinting — soft enough to read as a code block, with a strong inset
   stripe on the left edge so the +/-/ctx classification is visible without
   making the line itself a bright slab of color. */
.code-line--add{
  background: color-mix(in srgb, var(--sev-nit) 8%, transparent);
}
.code-line--del{
  background: color-mix(in srgb, var(--sev-critical) 7%, transparent);
}
.code-line--add .code-line__num{
  background: color-mix(in srgb, var(--sev-nit) 12%, transparent);
  color: color-mix(in srgb, var(--sev-nit) 75%, var(--fg) 25%);
}
.code-line--del .code-line__num{
  background: color-mix(in srgb, var(--sev-critical) 12%, transparent);
  color: color-mix(in srgb, var(--sev-critical) 75%, var(--fg) 25%);
}
/* Hunk header — rendered as a soft full-width divider with the @@ ... @@
   text dimmed; positions the reader inside the file without competing
   with the code. */
.code-line--hunk{
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  color: var(--fg-subtle);
  font-style: italic;
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  margin: 4px 0;
}
.code-line--hunk .code-line__text{ padding-top: 2px; padding-bottom: 2px }
/* Separator between distinct evidence snippets — quieter than a hunk
   header (no text), just enough to signal "different chunk". */
.code-hunk-sep{
  display: block;
  height: 1px;
  margin: 6px 0;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
}

/* (legacy .fix-conf-chip removed — fix confidence now reads inline as
   .fix-conf-inline on the Solution prose.) */

/* Related-files list — paths shown as click-to-open links. */
.related-files{
  margin: var(--s-1) 0 var(--s-2);
  padding-left: 0;
  list-style: none;
}
.related-files li{ margin-bottom: 4px }
.related-file{
  font-family: var(--vscode-editor-font-family);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in srgb, var(--fg) 28%, transparent);
  padding-bottom: 1px;
  transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.related-file:hover,
.related-file:focus-visible{
  color: var(--accent);
  border-bottom-color: var(--accent);
  outline: none;
}

.actions{
  padding: var(--s-3);
  border-top: 1px solid var(--border);
  display:flex; align-items: center; gap:var(--s-2); flex-wrap:wrap;
  background: color-mix(in srgb, var(--fg) 2%, transparent);
}
/* Pushes destructive-adjacent actions (Dismiss / Restore) to the right edge
   so they never sit flush against the primary CTA. */
.actions__spacer{ flex: 1 }
/* Buttons inside the card footer get a permanently-visible border (instead
   of borderless-until-hover) — they read as proper buttons even at rest,
   which is the Linear/GitHub PRO feel. */
.actions .btn--ghost{
  border-color: color-mix(in srgb, var(--fg) 14%, transparent);
  color: var(--fg);
}
.actions .btn--ghost:hover{
  border-color: color-mix(in srgb, var(--fg) 24%, transparent);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}
/* Quiet variant for low-emphasis actions like Dismiss — borderless at rest
   so it doesn't compete with the action cluster; hover hints at destructive
   intent with a faint critical-tone border without screaming. The leading
   icon (× or ↺) makes the affordance unmistakable even without a border. */
.btn--quiet{
  color: var(--fg-muted);
  border-color: transparent !important;
  background: transparent;
}
.btn--quiet .btn__icon{ font-size: 13px; line-height: 1 }
.btn--quiet:hover{
  color: var(--sev-critical);
  border-color: color-mix(in srgb, var(--sev-critical) 35%, transparent) !important;
  background: color-mix(in srgb, var(--sev-critical) 8%, transparent);
}

/* Collapsible <details> for Alternatives + Evidence. Default-closed keeps
   the open card scannable; the count chip lets the user decide whether the
   payload is worth expanding.

   The animation uses interpolate-size + ::details-content (Chromium 131+,
   which VS Code shipped late-2024). Older builds simply snap open without
   the transition — no fallback markup needed. */
@supports (interpolate-size: allow-keywords){
  :root{ interpolate-size: allow-keywords }
  .fb-collapse{
    interpolate-size: allow-keywords;
  }
  .fb-collapse::details-content{
    block-size: 0;
    overflow: hidden;
    transition:
      block-size var(--dur-med) var(--ease),
      content-visibility var(--dur-med) var(--ease) allow-discrete;
  }
  .fb-collapse[open]::details-content{ block-size: auto }
}
.fb-collapse{ margin: 0 }
.fb-collapse__summary{
  list-style: none;
  display: flex; align-items: center; gap: var(--s-2);
  cursor: pointer;
  padding: 4px 0;
  border-radius: var(--r-sm);
  user-select: none;
}
.fb-collapse__summary::-webkit-details-marker{ display: none }
.fb-collapse__summary::marker{ content: '' }
.fb-collapse__summary:hover .section-h{ color: var(--fg) }
.fb-collapse__summary:focus-visible{ outline: 2px solid var(--accent); outline-offset: 2px }
/* Chevron is built from a unicode "›" — to align it with the small-caps
   header baseline we drop its line-height to 1 and nudge with translateY.
   Without this it floats above the cap-height of the label. */
.fb-collapse__chev{
  display: inline-flex; align-items: center; justify-content: center;
  width: 12px; height: 12px;
  font-size: 14px; line-height: 1;
  color: var(--fg-subtle);
  transition: transform var(--dur-fast) var(--ease);
  transform: translateY(-1px);
  flex-shrink: 0;
}
.fb-collapse[open] .fb-collapse__chev{ transform: translateY(-1px) rotate(90deg) }
.fb-collapse__count{
  display: inline-block;
  min-width: 18px; padding: 0 6px;
  text-align: center;
  font-size: 10px; font-weight: 700;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
  border-radius: 10px;
  letter-spacing: 0; text-transform: none;
}
/* Body of the open <details>: aligned flush with the section header so the
   content reads in the same column as every other section's prose. Adds top
   space so content doesn't kiss the summary row, especially for code blocks
   which would otherwise touch the chevron line. */
.fb-collapse__body{ margin-top: var(--s-2); padding-left: 0 }
ul.fb-collapse__body{ padding-left: 0 }

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
/* When a tooltip is being hovered inside a finding card, drop the card's
 * overflow:hidden so the popover can render outside the card boundary.
 * Without this the tooltip is clipped at the card edge and invisible.
 * Also bump z-index so the popover renders above sibling cards (otherwise
 * a neighboring card stacked later in flow can paint over it).
 * The :has() selector is supported in current Chromium (which VS Code
 * webviews use) — safe fallback for older engines: tooltip stays clipped
 * but the card layout itself is fine. */
.finding{ position: relative }
.finding:has(.tip-host:hover),
.finding:has(.tip-host:focus-visible),
.finding:has(.tip-host:focus-within){
  overflow: visible;
  z-index: 5;
}
/* Mirror the unclip on the head rows — those carry their own overflow:hidden
   so the title/path can ellipsis-truncate, but that also clips tooltips on
   the decision badge etc. */
.finding-head__row:has(.tip-host:hover),
.finding-head__row:has(.tip-host:focus-visible),
.finding-head__row:has(.tip-host:focus-within){
  overflow: visible;
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
/* Icon-less header — the colored accent bar (set per decision below) carries
   the visual cue the old emoji used to. */
.decision-detail__head{
  display: flex; align-items: center; gap: var(--s-2);
  padding: var(--s-2) var(--s-4);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-left: 3px solid color-mix(in srgb, var(--accent) 50%, transparent);
}
.decision-detail[data-decision="drop"] .decision-detail__head{
  border-left-color: color-mix(in srgb, var(--sev-critical) 70%, transparent);
}
.decision-detail[data-decision="merge"] .decision-detail__head{
  border-left-color: color-mix(in srgb, var(--accent) 70%, transparent);
}
.decision-detail[data-decision="revise"] .decision-detail__head{
  border-left-color: color-mix(in srgb, var(--sev-major) 70%, transparent);
}
.decision-detail__title{
  font-size: var(--t-xs); font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--fg-muted);
}
.decision-detail__body{ padding: var(--s-4) }
.decision-detail__body h4{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs); font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--fg-muted);
  display:flex; align-items:center; gap:var(--s-2);
  padding-left: var(--s-2);
  border-left: 2px solid color-mix(in srgb, var(--fg) 18%, transparent);
  line-height: 1.2;
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
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px;
  color: var(--fg-subtle);
  cursor: help;
  letter-spacing: 0; text-transform: none;
  border-radius: 50%;
  transition: color var(--dur-fast) var(--ease);
}
.findings-divider__hint:hover,
.findings-divider__hint:focus-visible{ color: var(--fg); outline: none }
.findings-divider__hint-dot{
  display: inline-block;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
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

/* Inline code spans inside LLM prose (problem/reasoning/solution/concerns/
 * strengths). Rendered via escMd() in finding cards and the review summary
 * so identifiers like \`.env\`, \`JWT_SECRET\`, \`config.ts\` get monospaced
 * and visually separated from surrounding prose. Sized slightly smaller
 * than the body text (0.9em) so it sits on the baseline instead of bulging
 * the line-height. */
.md-code{
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  padding: 1px 5px;
  border-radius: var(--r-sm);
  background: var(--bg-code);
  color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
  /* Keep code spans from breaking mid-identifier — the whole token wraps as
   * a unit. Overflow-wrap still lets very long tokens break if they would
   * otherwise overflow the container. */
  white-space: nowrap;
  overflow-wrap: anywhere;
}

`;
