/**
 * Pass timeline rendered in the left pane.
 *
 * Steps shown here are non-orchestrator-pass entries (context, diff) plus
 * each pass. Status drives the visuals and which action buttons we render:
 *   running        → spinner
 *   done           → check
 *   error          → warning + (if review stopped) inline Retry button
 *   awaitDecision  → warning + Retry/Skip/Stop buttons (orchestrator paused)
 *   skipped        → muted, strike-through + Retry button when review stopped
 *
 * Also appends a synthetic "Consolidation" pill after specialists if state
 * has a consolidation event recorded.
 */
export const TIMELINE = `
  // Real pass names that can be retried/skipped/stopped. 'context' and 'diff'
  // are bootstrap stages, not Claude passes — they don't get action buttons.
  const ACTIONABLE_PASSES = new Set(['structural','explore','security','performance','accessibility','tests','gaps','permute','critique']);

  // Inline SVG spinner used when a step is in 'running' state. Pulled out so
  // both buildStepNode and updateStepNode emit the exact same markup — that
  // way reusing an existing running node never accidentally swaps the
  // spinner's parent element and resets its CSS animation.
  function spinnerSvgHtml(){
    return '<svg class="ico-spinner" viewBox="0 0 24 24" aria-hidden="true">' +
             '<circle class="ico-spinner__track" cx="12" cy="12" r="9"></circle>' +
             '<circle class="ico-spinner__arc"   cx="12" cy="12" r="9"></circle>' +
           '</svg>';
  }
  function iconForStatus(status){
    return status==='running' ? spinnerSvgHtml()
      : status==='done' ? '✓'
      : status==='error' ? '⚠'
      : status==='awaitDecision' ? '⚠'
      : status==='skipped' ? '–'
      : '·';
  }

  /**
   * Build the inner contents (.ico + .body) HTML for a step. Used by both
   * creation (full DOM replace) and updates (textContent / innerHTML swaps
   * on the existing children).
   */
  function buildStepInnerHtml(pass, info, now){
    const label = passLabelLong(pass);
    const skipBadge = info.autoSkipped
      ? '<span class="step-badge step-badge--auto" tabindex="0">ⓘ '+esc(tMsg('conditionalSkip.label'))+
          '<span class="step-tip" role="tooltip">' +
            '<span class="step-tip__title">'+esc(tMsg('conditionalSkip.label'))+'</span>' +
            '<span class="step-tip__hint">'+esc(info.detail || tMsg('conditionalSkip.label'))+'</span>' +
          '</span>' +
        '</span>'
      : '';
    let elapsed = '';
    if (info.startedAt){
      const end = info.endedAt || now;
      elapsed = fmtElapsed(end - info.startedAt);
    }
    // Metric chips replace the dense single-line summary once the pass has
    // finished. Built from info.metrics (parsed from the telemetry line) and
    // info.findingCount / info.durationMs (carried over from passDone).
    const chipsHtml = renderMetricChips(info);
    // The free-form "activity" line under the metric meta was previously a
    // 120-char slice of the raw stream chunk — that's where the Security row's
    // mid-JSON fragment came from. Drop it entirely; everything meaningful now
    // lives in info.detail (one line) and chipsHtml (structured chips).
    const metaText = info.detail || (info.status==='running' ? tMsg('timeline.working') : '');
    const meta = metaText ? '<div class="meta" title="'+escAttr(metaText)+'">'+esc(metaText)+'</div>' : '';
    const actions = renderStepActions(pass, info);
    const body =
      '<div class="body">' +
        '<div class="label"><span>'+esc(label)+'</span>'+skipBadge+'<span class="elapsed">'+esc(elapsed)+'</span></div>' +
        meta +
        chipsHtml +
        actions +
      '</div>';
    return { icoHtml: iconForStatus(info.status), bodyHtml: body };
  }

  /**
   * Render the metric-chip row shown under a finished pass. Each chip is a
   * compact label · value pair (e.g. "Tokens · 130k / 1.9k") and carries a
   * hover tooltip that explains what the metric measures and shows a
   * dynamic breakdown of the value (token splits, cached portion, tool
   * names, etc.) so the panel is self-documenting.
   */
  function renderMetricChips(info){
    if (info.status !== 'done') return '';
    const m = info.metrics || {};
    // Prefer telemetry-line values for cost/tokens/cache; fall back to the
    // passDone event for finding count and wall-clock seconds so the chips
    // still render even if a telemetry summary never arrived.
    const findings = typeof info.findingCount === 'number' ? info.findingCount : null;
    const seconds = typeof m.seconds === 'number' ? m.seconds
      : typeof info.durationMs === 'number' ? info.durationMs/1000 : null;
    const chips = [];
    // Tokens replace the USD chip — billing varies per user (subscription vs
    // API), tokens are the universal unit and tell the same story.
    if (typeof m.inTokens === 'number' || typeof m.outTokens === 'number'){
      const inT = m.inTokens || 0, outT = m.outTokens || 0;
      chips.push({
        label: tMsg('timeline.chip.tokens'),
        value: fmtCount(inT)+' / '+fmtCount(outT),
        kind: 'tokens',
        tip: {
          title: tMsg('timeline.chip.tokens.tip.title'),
          hint: tMsg('timeline.chip.tokens.tip.hint'),
          detail: tMsg('timeline.chip.tokens.tip.detail', { input: fmtCount(inT), output: fmtCount(outT) }),
        },
      });
    }
    if (typeof m.cachePct === 'number'){
      // Approximate cached-token count from the percentage and input total.
      // The telemetry line only carries the percent; this is a derived view
      // that helps the user grok what "96%" means in absolute terms.
      const inT = typeof m.inTokens === 'number' ? m.inTokens : null;
      const cachedDetail = inT != null
        ? tMsg('timeline.chip.cache.tip.detail', { cached: fmtCount(Math.round(inT * m.cachePct / 100)), total: fmtCount(inT) })
        : '';
      chips.push({
        label: tMsg('timeline.chip.cache'),
        value: m.cachePct+'%',
        kind: 'cache',
        tip: {
          title: tMsg('timeline.chip.cache.tip.title'),
          hint: tMsg('timeline.chip.cache.tip.hint'),
          detail: cachedDetail,
        },
      });
    }
    if (seconds != null){
      const cliSec = typeof m.seconds === 'number' ? m.seconds : null;
      const wallSec = typeof info.durationMs === 'number' ? info.durationMs/1000 : null;
      // Both numbers are interesting when they differ — CLI seconds is what the
      // model spent, wall-clock includes startup/parsing on our side.
      const detail = (cliSec != null && wallSec != null)
        ? tMsg('timeline.chip.time.tip.detail', {
            cli: (cliSec < 10 ? cliSec.toFixed(1) : Math.round(cliSec))+'s',
            wall: fmtElapsed(info.durationMs),
          })
        : '';
      chips.push({
        label: tMsg('timeline.chip.time'),
        value: (seconds < 10 ? seconds.toFixed(1) : Math.round(seconds))+'s',
        kind: 'time',
        tip: {
          title: tMsg('timeline.chip.time.tip.title'),
          hint: tMsg('timeline.chip.time.tip.hint'),
          detail: detail,
        },
      });
    }
    if (findings != null && findings > 0){
      chips.push({
        label: tMsg('timeline.chip.findings'),
        value: String(findings),
        kind: 'findings',
        tip: {
          title: tMsg('timeline.chip.findings.tip.title'),
          hint: tMsg('timeline.chip.findings.tip.hint'),
          detail: tMsg('timeline.chip.findings.tip.detail', { count: findings }),
        },
      });
    }
    if (typeof m.toolsUsed === 'number' && m.toolsUsed > 0){
      // info.tools accumulates the unique tool names seen on the stream (see
      // eventStream.ts passOutput handler). When present we list them; when
      // the stream didn't carry classifiable tool markers we fall back to the
      // count-only detail line so the tooltip still says something honest.
      const toolNames = Array.isArray(info.tools) ? info.tools : [];
      const detail = toolNames.length > 0
        ? tMsg('timeline.chip.tools.tip.detail', { tools: toolNames.join(', ') })
        : tMsg('timeline.chip.tools.tip.detailUnknown', { count: m.toolsUsed });
      chips.push({
        label: tMsg('timeline.chip.tools'),
        value: String(m.toolsUsed),
        kind: 'tools',
        tip: {
          title: tMsg('timeline.chip.tools.tip.title'),
          hint: tMsg('timeline.chip.tools.tip.hint'),
          detail: detail,
        },
      });
    }
    if (chips.length === 0) return '';
    return '<div class="chips" role="list">' +
      chips.map(c => {
        // All chip tips open ABOVE the chip and anchor to the chip's LEFT
        // edge (default .tip behavior). The .step .chip > .tip CSS clamps
        // max-width so the popover can't overflow the panel — combined with
        // left:0 this is robust whether the chip lands on the first or a
        // wrapped second row, near either edge of a narrow card.
        const tip = c.tip
          ? '<span class="tip tip--above" role="tooltip">' +
              '<span class="tip__title">'+esc(c.tip.title)+'</span>' +
              '<span class="tip__hint">'+esc(c.tip.hint)+'</span>' +
              (c.tip.detail ? '<span class="tip__detail">'+esc(c.tip.detail)+'</span>' : '') +
            '</span>'
          : '';
        return '<span class="chip chip--'+c.kind+' tip-host" role="listitem" tabindex="0">' +
          '<span class="chip__k">'+esc(c.label)+'</span>' +
          '<span class="chip__v">'+esc(c.value)+'</span>' +
          tip +
        '</span>';
      }).join('') +
    '</div>';
  }

  function buildStepNode(pass, info, now){
    const div = document.createElement('div');
    div.className = 'step ' + info.status;
    if (info.autoSkipped) div.classList.add('step--auto-skipped');
    div.setAttribute('role', 'listitem');
    div.dataset.pass = pass;
    div.dataset.status = info.status;
    const { icoHtml, bodyHtml } = buildStepInnerHtml(pass, info, now);
    div.innerHTML = '<div class="ico" aria-hidden="true">'+ icoHtml +'</div>' + bodyHtml;
    return div;
  }

  /**
   * Auto-scroll the left pane so a newly-running step isn't hidden under the
   * sticky run card.
   *
   * Only triggers when the user is already near the bottom (within 120px) so
   * we don't yank them away while they're reading an earlier step. The sticky
   * .section--run can cover ~half the panel during a run; --run-h lets the
   * CSS scroll-margin-bottom track the actual measured height instead of a
   * guess.
   */
  function autoScrollToRunningStep(el){
    if (!el) return;
    const left = document.querySelector('.left');
    if (!left) return;
    // Stacked layout (.section--run becomes static) — let normal flow handle
    // it. window.innerWidth check mirrors the @media (max-width: 760px) rule.
    if (window.innerWidth <= 760) return;
    const runSection = document.querySelector('.section--run');
    if (runSection){
      const h = runSection.getBoundingClientRect().height;
      if (h > 0) left.style.setProperty('--run-h', h + 'px');
    }
    const NEAR_BOTTOM = 120;
    const distanceFromBottom = left.scrollHeight - left.scrollTop - left.clientHeight;
    if (distanceFromBottom > NEAR_BOTTOM) return;
    // rAF lets the just-mutated DOM commit layout before we measure / scroll.
    requestAnimationFrame(function(){
      try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      catch(_){ el.scrollIntoView(false); }
    });
  }

  /**
   * Reconcile an existing step node with the latest info, swapping only what
   * changed. CRUCIAL: when status stays 'running', we do NOT re-write the
   * .ico's HTML — that would replace the <svg.ico-spinner> with a brand-new
   * element whose CSS animation restarts at frame 0. The whole point of the
   * incremental renderer is to keep that one element alive across re-renders
   * so the spinner stays fluid even when passOutput fires 10x/second.
   */
  function updateStepNode(div, pass, info, now){
    const prevStatus = div.dataset.status || '';
    if (prevStatus !== info.status){
      div.className = 'step ' + info.status;
      if (info.autoSkipped) div.classList.add('step--auto-skipped');
      div.dataset.status = info.status;
      const ico = div.querySelector('.ico');
      if (ico) ico.innerHTML = iconForStatus(info.status);
    } else if (info.autoSkipped !== div.classList.contains('step--auto-skipped')){
      div.classList.toggle('step--auto-skipped', !!info.autoSkipped);
    }
    // Body is cheap to swap and never contains the spinner, so we *can* always
    // rebuild — but a blind outerHTML swap destroys the chip's .tip-host while
    // the user is hovering it (10x/sec during streaming), which makes the
    // tooltip flicker as the browser fires hover-out / hover-in on each
    // freshly-created node. Skip the write when the markup is byte-identical
    // to what's already in the DOM. Common case: a 'done' step staying done
    // while another pass streams — its body literally has no reason to change.
    const { bodyHtml } = buildStepInnerHtml(pass, info, now);
    const body = div.querySelector('.body');
    if (body && body.outerHTML !== bodyHtml) body.outerHTML = bodyHtml;
  }

  function renderTimeline(){
    const root = $('#timeline');
    if (state.steps.size === 0){
      root.innerHTML = '<div class="timeline-empty">'+esc(tMsg('timeline.empty'))+'</div>';
      return;
    }
    // If the root was previously showing the empty state, clear it.
    const empty = root.querySelector('.timeline-empty');
    if (empty) empty.remove();
    const now = Date.now();
    // Walk state.steps in order; for each, either reuse the existing DOM
    // node (matched by data-pass) or build a new one. Existing nodes that
    // aren't in state.steps anymore get removed at the end.
    const wanted = new Set();
    let prevEl = null;
    for (const [pass, info] of state.steps){
      wanted.add(pass);
      // Synthetic consolidation entry — its renderer is special (carries
      // state.consolidation in addition to the bare info) but reuses the
      // same data-pass-keyed lookup so it can also stay put across renders.
      if (pass === '__consolidation__' && state.consolidation){
        let el = root.querySelector('.step[data-pass="__consolidation__"]');
        const fresh = renderConsolidationStep(state.consolidation);
        fresh.dataset.pass = '__consolidation__';
        if (el){
          el.replaceWith(fresh);
          el = fresh;
        } else {
          if (prevEl) prevEl.after(fresh); else root.prepend(fresh);
          el = fresh;
        }
        prevEl = el;
        continue;
      }
      let el = root.querySelector('.step[data-pass="'+CSS.escape(pass)+'"]');
      let becameRunning = false;
      if (!el){
        el = buildStepNode(pass, info, now);
        if (prevEl) prevEl.after(el); else root.prepend(el);
        becameRunning = info.status === 'running';
      } else {
        const prevStatus = el.dataset.status || '';
        becameRunning = info.status === 'running' && prevStatus !== 'running';
        updateStepNode(el, pass, info, now);
      }
      if (becameRunning) autoScrollToRunningStep(el);
      prevEl = el;
    }
    // Remove any step that's no longer in the model.
    for (const el of Array.from(root.querySelectorAll('.step'))){
      const k = el.dataset.pass;
      if (!wanted.has(k)) el.remove();
    }
    if (state.leftCollapsed) renderRail();
  }

  /** Render the synthetic Consolidation step. Pulled out so the main loop
   * stays readable; called inline when the iterator hits '__consolidation__'. */
  function renderConsolidationStep(c){
    const div = document.createElement('div');
    // No-op consolidation (merged === 0) gets a muted "noop" variant so the
    // user does not read a green check as "did meaningful work". The badge
    // text also drops the noisy "−0" in favor of "no duplicates".
    const isNoop = c.merged === 0;
    div.className = 'step done step--consolidation' + (isNoop ? ' step--noop' : '');
    div.setAttribute('role', 'listitem');
    const tip = tMsg('consolidation.tooltip', { merged: c.merged, before: c.before, after: c.after });
    const badgeText = isNoop
      ? tMsg('consolidation.badgeNoop')
      : tMsg('consolidation.badge', { merged: c.merged });
    div.innerHTML =
      '<div class="ico" aria-hidden="true">⇲</div>' +
      '<div class="body">' +
        '<div class="label"><span>'+esc(tMsg('timeline.consolidation'))+'</span>' +
          '<span class="step-badge step-badge--merged" tabindex="0">ⓘ '+esc(badgeText)+
            '<span class="step-tip" role="tooltip">' +
              '<span class="step-tip__title">'+esc(tMsg('timeline.consolidation'))+'</span>' +
              '<span class="step-tip__hint">'+esc(tip)+'</span>' +
            '</span>' +
          '</span>' +
        '</div>' +
        '<div class="meta">'+esc(c.before+' → '+c.after)+'</div>' +
      '</div>';
    return div;
  }

  function renderStepActions(pass, info){
    if (!ACTIONABLE_PASSES.has(pass)) return '';
    if (info.status === 'awaitDecision'){
      // Orchestrator is parked waiting for our verdict.
      return ''
        + '<div class="actions" role="group">'
        +   '<button class="primary" type="button" data-decision="retry" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.retry'))+'</button>'
        +   '<button type="button" data-decision="skip" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.skip'))+'</button>'
        +   '<button class="danger" type="button" data-decision="stop" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.stop'))+'</button>'
        + '</div>';
    }
    // After the review halted, offer per-step Retry on anything that didn't
    // finish cleanly. Hidden while another review is running so we don't queue
    // a second job.
    if (!state.isRunning && state.partial && (info.status === 'error' || info.status === 'skipped')){
      return ''
        + '<div class="actions">'
        +   '<button class="primary" type="button" data-retry-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.retryPass'))+'</button>'
        + '</div>';
    }
    return '';
  }
`;
