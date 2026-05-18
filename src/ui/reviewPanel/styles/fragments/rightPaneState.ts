/**
 * Right pane "state surface" — three modes share #right-state:
 *   .right-state--welcome   idle hero + branding + preview + phase cards + CTA + tip
 *   .right-state--progress  in-progress discoveries (tokens, files, skeletons)
 *   .right-state--message   short fallback for clean-review / no-match
 *
 * Plus #progress-sticky: a compact sticky bar inserted above the filters
 * once findings start streaming during a run, so the live signals don't
 * disappear when the cards take over.
 */
export const RIGHT_PANE_STATE_CSS = String.raw`
/* ─── shared surface ─────────────────────────────────────────────── */
.right-state{
  /* Center vertically when the surface owns the pane. */
  display: flex; flex-direction: column;
  min-height: calc(100% - 8px);
  padding: var(--s-3) 0;
}
.right-state[hidden]{ display: none }
.right-state--message{
  align-items: center; justify-content: center;
  color: var(--fg-muted);
  font-size: var(--t-sm);
}
.right-state--message p{ margin: 0; padding: var(--s-6); text-align: center }

/* ─── WELCOME PANEL ──────────────────────────────────────────────── */
.welcome{
  display: flex; flex-direction: column;
  gap: var(--s-4);
  max-width: 460px;
  margin: 0 auto;
  padding: var(--s-5) var(--s-3);
  width: 100%;
}
.welcome__head{
  display: flex; flex-direction: column;
  gap: var(--s-2);
  align-items: flex-start;
}
.welcome__eyebrow{
  display: inline-flex; align-items: center; gap: 8px;
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.welcome__dot{
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
}
.welcome__title{
  margin: 0;
  font-size: var(--t-2xl);
  line-height: 1.15;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.01em;
}
.welcome__tagline{
  margin: 0;
  color: var(--fg-muted);
  font-size: var(--t-md);
  line-height: var(--lh-loose);
}

/* Preview block: branches · diff · estimate, in card-like rows */
.welcome-preview{
  display: flex; flex-direction: column;
  gap: 6px;
  padding: var(--s-3) var(--s-4);
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.welcome-preview__row{
  display: flex; align-items: center; gap: var(--s-3);
  min-height: 24px;
  font-size: var(--t-sm);
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.welcome-preview__row--branches .welcome-preview__val{
  font-weight: 600;
  letter-spacing: -0.005em;
}
.welcome-preview__row--muted{ color: var(--fg-muted) }
.welcome-preview__row--hint .welcome-preview__icon{ color: var(--accent) }
.welcome-preview__icon{
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
  color: var(--fg-muted);
  font-size: 12px;
  flex-shrink: 0;
}
.welcome-preview__icon--spin{
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.welcome-preview__spinner{
  width: 11px; height: 11px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-top-color: var(--accent);
  animation: welcome-spin .9s linear infinite;
}
@keyframes welcome-spin{
  to { transform: rotate(360deg) }
}
.welcome-preview__val{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Shimmer for "Calculating diff…" / "Estimating…" — gives the row a
 * visible heartbeat so the user knows it's working, not stuck. */
.welcome-preview__val--shimmer{
  background: linear-gradient(
    90deg,
    var(--fg-muted) 0%,
    var(--fg) 50%,
    var(--fg-muted) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: welcome-shimmer 1.6s linear infinite;
}
@keyframes welcome-shimmer{
  0%   { background-position: 100% 0 }
  100% { background-position: -100% 0 }
}

/* Phase cards — 4-up grid that collapses to 2 then 1 on narrower right panes */
.welcome-phases__title{
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.welcome-phases__list{
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}
.welcome-phase{
  position: relative;
  display: flex; flex-direction: column;
  gap: 4px;
  padding: var(--s-3);
  padding-right: 28px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.welcome-phase:hover{
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, var(--bg));
}
/* Number sits in the corner as a quiet ordering hint — no longer competes
 * with the title for visual weight. */
.welcome-phase__num{
  position: absolute;
  top: 8px; right: 10px;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg-subtle);
  letter-spacing: 0.04em;
}
.welcome-phase__title{
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.005em;
}
.welcome-phase__hint{
  font-size: var(--t-xs);
  line-height: var(--lh-normal);
  color: var(--fg-muted);
}

/* Action block — groups CTA + shortcut + privacy note in one card so the
 * button has visual anchor instead of floating in the middle of the pane. */
.welcome-action{
  display: flex; flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-4);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-inset));
  border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--border));
}
.welcome-cta__btn{
  display: inline-flex; align-items: center; gap: 10px;
  padding: 10px 24px;
  border-radius: var(--r-lg);
  border: 0;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: var(--t-md);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 30%, transparent);
  transition: box-shadow var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease);
}
.welcome-cta__btn:hover{
  background: var(--accent-hover, var(--accent));
  filter: brightness(1.08);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 45%, transparent);
}
.welcome-cta__btn:active{ filter: brightness(0.96) }
.welcome-action[data-state="blocked"]{
  background: color-mix(in srgb, var(--fg) 3%, var(--bg-inset));
  border-color: var(--border);
}
.welcome-action[data-state="blocked"] .welcome-cta__btn{
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  color: var(--fg-muted);
  box-shadow: none;
  cursor: not-allowed;
}
.welcome-action[data-state="blocked"] .welcome-cta__btn:hover{
  transform: none;
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  box-shadow: none;
}
.welcome-cta__icon{ font-size: 11px }
.welcome-action__shortcut{
  margin: 0;
  color: var(--fg-muted);
  font-size: var(--t-xs);
  text-align: center;
}
.welcome-action__shortcut kbd{
  display: inline-block;
  padding: 1px 6px;
  margin: 0 1px;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  color: var(--fg);
  font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
}
.welcome-action__divider{
  width: 100%;
  height: 1px;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  margin-top: 2px;
}
.welcome-action__note{
  margin: 0;
  display: flex; align-items: flex-start; gap: 8px;
  color: var(--fg-muted);
  font-size: var(--t-xs);
  line-height: var(--lh-normal);
  text-align: left;
}
.welcome-action__note-icon{
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1.4;
}

/* Tip line */
.welcome-tip{
  display: flex; align-items: flex-start; gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--fg) 3%, transparent);
  color: var(--fg-muted);
  font-size: var(--t-xs);
  line-height: var(--lh-normal);
}
.welcome-tip__icon{ flex-shrink: 0; line-height: 1.4 }
.welcome-tip__text{ min-width: 0 }

/* ─── IN-PROGRESS PANEL ──────────────────────────────────────────── */
.progress{
  display: flex; flex-direction: column;
  gap: var(--s-4);
  max-width: 620px;
  margin: 0 auto;
  padding: var(--s-4) var(--s-3);
  width: 100%;
}
.progress__head{
  display: flex; align-items: center; gap: var(--s-3);
}
.progress__pulse{
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: progress-pulse 1.6s ease-in-out infinite;
}
@keyframes progress-pulse{
  0%, 100%{ box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent); opacity: 1 }
  50%{ box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent); opacity: .6 }
}
.progress__head-body{ flex: 1 1 auto; min-width: 0 }
.progress__title{
  margin: 0;
  font-size: var(--t-lg);
  font-weight: 600;
  color: var(--fg);
}
.progress__subtitle{
  margin: 2px 0 0;
  font-size: var(--t-xs);
  color: var(--fg-muted);
}
.progress__elapsed{
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--t-sm);
  color: var(--fg);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-inset);
  border: 1px solid var(--border);
}

.progress-stats{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-2);
}
.progress-stat{
  display: flex; align-items: baseline; gap: 8px;
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
}
.progress-stat__icon{
  font-size: 13px;
  color: var(--accent);
  flex-shrink: 0;
}
.progress-stat__lead{
  font-size: var(--t-sm);
  color: var(--fg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex: 1 1 auto;
  min-width: 0;
}
.progress-stat__sub{
  font-size: var(--t-xs);
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* Reviewed-files list — compact, color-coded by blast radius */
.progress-files{
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}
.progress-file{
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px;
  border-radius: var(--r-sm);
  background: var(--bg-inset);
  font-size: var(--t-xs);
  color: var(--fg);
  min-width: 0;
}
.progress-file__path{
  flex: 1 1 auto;
  font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.progress-file__kind,
.progress-file__blast{
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
}
.progress-file__blast[data-blast="wide"]{ background: color-mix(in srgb, var(--sev-major) 22%, transparent); color: var(--fg) }
.progress-file__blast[data-blast="narrow"]{ background: color-mix(in srgb, var(--sev-nit) 22%, transparent); color: var(--fg) }
.progress-file__blast[data-blast="isolated"]{ background: color-mix(in srgb, var(--sev-minor) 22%, transparent); color: var(--fg) }
.progress-file--more{
  background: transparent;
  color: var(--fg-subtle);
  font-size: 11px;
  justify-content: center;
}

/* Waiting hint + skeleton placeholders */
.progress-wait{
  display: flex; align-items: center; gap: 8px;
  padding-top: var(--s-2);
  font-size: var(--t-xs);
  color: var(--fg-muted);
}
.progress-wait__icon{ font-size: 13px }
.progress-skels{
  display: flex; flex-direction: column;
  gap: var(--s-2);
}
.progress-skel{
  display: flex; flex-direction: column;
  gap: 8px;
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
  animation: progress-skel-pulse 1.8s ease-in-out infinite;
  animation-delay: calc(var(--skel-i, 0) * 180ms);
  opacity: .6;
}
.progress-skel__row{
  height: 10px;
  border-radius: var(--r-sm);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--fg) 6%, transparent) 0%,
    color-mix(in srgb, var(--fg) 12%, transparent) 50%,
    color-mix(in srgb, var(--fg) 6%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: progress-skel-shimmer 1.8s linear infinite;
}
.progress-skel__row--head{ width: 40%; height: 12px }
.progress-skel__row--body{ width: 100% }
.progress-skel__row--short{ width: 70% }
@keyframes progress-skel-pulse{
  0%, 100%{ opacity: .55 }
  50%{ opacity: .8 }
}
@keyframes progress-skel-shimmer{
  0%{ background-position: 100% 0 }
  100%{ background-position: -100% 0 }
}

/* When the in-progress sticky bar is present, push the filters-wrap sticky
 * top below it so both bars remain visible on scroll. :has() narrows the
 * rule to the case that matters — no impact on idle / finished states. */
.right:has(.progress-sticky) .filters-wrap{ top: 40px }

/* ─── STICKY HEADER (running + findings) ─────────────────────────
 * Compact summary that takes over once findings start streaming. The
 * pulse + label communicate "this is still running"; the chips show the
 * three numbers users glance at most (elapsed, tokens, files). Stop
 * sits at the right edge so its hit-area never overlaps the chips. */
.progress-sticky{
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex; align-items: center; gap: 10px;
  padding: 8px var(--s-3);
  margin: calc(-1 * var(--s-5)) calc(-1 * var(--s-6)) var(--s-3);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 10%, var(--bg)) 0%,
    color-mix(in srgb, var(--accent) 6%, var(--bg)) 100%
  );
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  font-size: var(--t-xs);
  font-variant-numeric: tabular-nums;
}
.progress-sticky__pulse{
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-left: 2px;
  animation: progress-pulse 1.6s ease-in-out infinite;
}
.progress-sticky__label{
  flex-shrink: 0;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding-right: var(--s-2);
  border-right: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
}
.progress-sticky__chips{
  display: flex; align-items: center; gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}
.progress-sticky__chip{
  display: inline-flex; align-items: baseline; gap: 5px;
  color: var(--fg);
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  white-space: nowrap;
}
.progress-sticky__chip-icon{
  display: inline-flex;
  align-items: center;
  color: var(--fg-subtle);
  /* SVG glyph baseline alignment — sits 1px above flex baseline by default
   * which makes the chip look top-heavy. */
  transform: translateY(1px);
}
.progress-sticky__chip-val{
  font-weight: 600;
  color: var(--fg);
}
.progress-sticky__chip-unit{
  font-size: 10px;
  color: var(--fg-subtle);
  font-weight: 500;
}
.progress-sticky__stop{
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--sev-critical) 55%, transparent);
  background: color-mix(in srgb, var(--sev-critical) 8%, transparent);
  color: var(--sev-critical);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.progress-sticky__stop::before{
  content: '';
  width: 8px; height: 8px;
  background: currentColor;
  border-radius: 1px;
  display: inline-block;
}
.progress-sticky__stop:hover{
  background: var(--sev-critical);
  color: #fff;
  border-color: var(--sev-critical);
}

/* ─── Container query: narrow right pane ─────────────────────────── */
@container right (max-width: 520px){
  .progress-stats{ grid-template-columns: minmax(0, 1fr) }
}
@container right (max-width: 360px){
  .welcome-phases__list{ grid-template-columns: minmax(0, 1fr) }
  .welcome{ padding: var(--s-3) 0 }
  .welcome__title{ font-size: var(--t-xl) }
  .welcome-action{ padding: var(--s-3) }
  .progress-sticky{ flex-wrap: wrap }
  .progress-sticky__stop{ margin-left: 0 }
}
`;
