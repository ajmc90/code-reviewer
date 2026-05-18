/**
 * Direct button bindings (one .addEventListener per #id) plus a global
 * Cmd/Ctrl-\\ shortcut for collapsing and the 1Hz tick that keeps the
 * running run-card chip's elapsed counter live.
 *
 * Conceptually different from 97-domHandlers (which uses event delegation
 * for dynamically-rendered finding cards). These bindings target stable
 * elements that exist from the moment the HTML is rendered.
 */
export const BUTTONS = `
  /**
   * Defensive reset of the running state. Called when the user takes an
   * action that implies the review is no longer active (Resume, Discard)
   * but state.isRunning is still true because the cancelled/done/paused
   * event got lost. Without this, clicks on Resume/Discard get swallowed
   * by their internal isRunning guard and the user sees "nothing happens."
   */
  function forceResetRunningState(){
    state.isRunning = false;
    state.runStartedAt = null;
    state.currentPhase = null;
    if (state.stopWatchdog){ clearTimeout(state.stopWatchdog); state.stopWatchdog = null; }
    reconcileRunningSteps(Date.now(), tMsg('timeline.cancelled'));
    renderTimeline();
    renderRunCard();
    renderCostPill();
  }

  $('#passes').addEventListener('change', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    const key = t.dataset.pass;
    if (!key || !PASS_KEY_SET.has(key)) return;
    state.passes[key] = t.checked;
    renderPasses();
    persist();
    requestEstimate();
  });
  $('#btn-toggle-advanced').addEventListener('click', () => {
    state.advancedOpen = !state.advancedOpen;
    applyAdvancedOpen();
    persist();
  });
  $('#presets').addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest('[data-preset]');
    if (!btn) return;
    ev.preventDefault();
    applyPreset(btn.dataset.preset);
  });

  $('#btn-collapse').addEventListener('click', () => setLeftCollapsed(!state.leftCollapsed));

  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === '\\\\'){
      ev.preventDefault();
      setLeftCollapsed(!state.leftCollapsed);
      return;
    }
    // Cmd/Ctrl + Alt + R → mirror the VS Code keybinding inside the
    // webview. VS Code's global keybinding doesn't fire when the webview
    // has focus, but the welcome panel advertises this shortcut, so we
    // honor it ourselves by proxy-clicking #btn-start (which already
    // handles the disabled state, branch validation, and confirm modal).
    const isAltR = ev.altKey && (ev.key === 'r' || ev.key === 'R' || ev.code === 'KeyR');
    if (isAltR && (ev.metaKey || ev.ctrlKey)){
      ev.preventDefault();
      const start = $('#btn-start');
      if (start && start.getAttribute('aria-disabled') !== 'true') start.click();
    }
  });

  $('#cat-filters').addEventListener('click', (ev) => {
    const t = ev.target instanceof HTMLElement ? ev.target.closest('[data-cat],[data-cat-all]') : null;
    if (!t) return;
    if (t.hasAttribute('data-cat-all')){
      state.categoryFilters.clear();
    } else {
      const c = t.getAttribute('data-cat');
      if (state.categoryFilters.has(c)) state.categoryFilters.delete(c);
      else state.categoryFilters.add(c);
    }
    renderFindings();
  });

  $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderFindings() });
  $('#btn-export').addEventListener('click', () => vscode.postMessage({type:'export'}));

  $('#branch-filter').addEventListener('input', (e) => { state.branchSearch = e.target.value; renderBranchPicker() });
  $('#show-local').addEventListener('change', (e) => { state.showLocal = e.target.checked; renderBranchPicker() });
  $('#show-remote').addEventListener('change', (e) => { state.showRemote = e.target.checked; renderBranchPicker() });
  $('#btn-locate').addEventListener('click', () => {
    locateSelectedBranches();
  });
  $('#btn-fetch').addEventListener('click', () => {
    if (state.fetching) return;
    state.fetching = true;
    const b = $('#btn-fetch'); b.setAttribute('aria-disabled','true'); b.innerHTML = '<span aria-hidden="true">⟳</span> '+esc(tMsg('panel.fetching'));
    vscode.postMessage({type:'fetchBranches', prune:true});
  });
  $('#btn-start').addEventListener('click', () => {
    if (state.isRunning){
      // Acts as Stop while running. Disable immediately so it can't be
      // double-clicked while the cancellation propagates.
      const b = $('#btn-start');
      b.setAttribute('aria-disabled', 'true');
      // Mutate the existing icon + label spans IN PLACE. Replacing innerHTML
      // wholesale would destroy '.run-card__btn-icon' / '.run-card__btn-label',
      // and renderRunCard early-returns when those children are missing — so
      // the next terminal event (cancelled/done/paused) would be unable to
      // repaint the button and it would freeze at "Stopping…" forever.
      const icon = b.querySelector('.run-card__btn-icon');
      const label = b.querySelector('.run-card__btn-label');
      if (icon) icon.textContent = '■';
      if (label) label.textContent = tMsg('panel.stopping');
      vscode.postMessage({type:'cancelReview'});
      // Watchdog: if no terminal event (cancelled/done/paused) arrives within
      // 12s, force-reset the button. Protects against host-side hangs (CLI
      // ignoring SIGTERM, error not propagating, etc.) so the user is never
      // stuck looking at "Stopping…" forever.
      if (state.stopWatchdog) clearTimeout(state.stopWatchdog);
      state.stopWatchdog = setTimeout(() => {
        if (state.isRunning){
          // Treat it as cancelled from the UI's perspective. The host may
          // still finish doing whatever it was doing; the state will reconcile
          // when its terminal event finally arrives.
          state.isRunning = false;
          state.runStartedAt = null;
          state.currentPhase = null;
          // Mark any pass still showing the running spinner as stopped so the
          // timeline doesn't keep an infinite "Sending prompt…" row alive.
          reconcileRunningSteps(Date.now(), tMsg('timeline.cancelled'));
          appendLive('warn', tMsg('log.cancelTimeout'), 'review');
          renderTimeline();
          renderRunCard();
          renderCostPill();
        }
        state.stopWatchdog = null;
      }, 12000);
      return;
    }
    if ($('#btn-start').getAttribute('aria-disabled') === 'true') return;
    // Route through maybeConfirmAndStart so heavy runs prompt the user before
    // burning context. The function dispatches the actual startReview message
    // once any required confirmation is accepted.
    maybeConfirmAndStart();
  });
  $('#btn-resume').addEventListener('click', () => {
    if (!state.partial) return;
    // Resume from a partial implies the review is NOT currently running. If
    // isRunning is still true here, the previous run's terminal event got
    // lost — force-reset before dispatching so the host doesn't reject.
    if (state.isRunning) forceResetRunningState();
    vscode.postMessage({type:'resumeReview'});
  });
  $('#btn-discard-partial').addEventListener('click', () => {
    if (!state.partial) return;
    // Same defensive reset as Resume — the banner showing implies a paused
    // review; if isRunning is still true the user-visible state is stale
    // and we don't want to silently swallow their click.
    if (state.isRunning) forceResetRunningState();
    vscode.postMessage({type:'discardPartial'});
  });
  // Timeline buttons are rendered dynamically, so we delegate to the container.
  $('#timeline').addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const decisionBtn = t.closest('button[data-decision]');
    if (decisionBtn){
      const pass = decisionBtn.getAttribute('data-pass');
      const decision = decisionBtn.getAttribute('data-decision');
      if (pass && decision){
        // Disable the whole action row immediately so the user can't double-click
        // a different decision while the message is in flight.
        const row = decisionBtn.closest('.actions');
        if (row) row.querySelectorAll('button').forEach((b) => b.setAttribute('disabled','true'));
        vscode.postMessage({type:'passDecision', pass, decision});
      }
      return;
    }
    const retryBtn = t.closest('button[data-retry-pass]');
    if (retryBtn){
      const pass = retryBtn.getAttribute('data-retry-pass');
      if (pass){
        retryBtn.setAttribute('disabled','true');
        retryBtn.textContent = '↻ Retrying…';
        vscode.postMessage({type:'retryPass', pass});
      }
    }
  });
  $('#btn-toggle-log').addEventListener('click', () => {
    state.logOpen = !state.logOpen;
    applyLogOpen();
    persist();
  });
  $('#summary-toggle').addEventListener('click', () => {
    state.summaryCollapsed = !state.summaryCollapsed;
    applySummaryCollapse();
    persist();
  });
  $('#cost-pill').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (state.estimate) toggleCostBreakdown();
  });
  $('#btn-clear-log').addEventListener('click', clearLive);
  $('#btn-copy-log').addEventListener('click', () => {
    const live = $('#live');
    const text = live.innerText || live.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const b = $('#btn-copy-log'); const orig = b.textContent;
      b.textContent = '✓ Copied'; setTimeout(() => b.textContent = orig, 1200);
    }).catch(() => {});
  });

  setInterval(() => {
    if (state.isRunning){
      renderTimeline();
      // Keep the elapsed-time counter in the Run card chip ticking.
      renderRunCard();
      // Also tick the right-pane in-progress panel + sticky header so the
      // elapsed/tokens chips stay alive even when no events arrived this
      // second. 'tick' mode keeps the skeleton + tip DOM in place (no
      // shimmer animation restart) and only swaps the live numbers.
      renderRightPaneState('tick');
    }
  }, 1000);
`;
