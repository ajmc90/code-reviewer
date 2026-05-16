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
  $('#passes').addEventListener('change', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    const key = t.dataset.pass;
    if (!key || !PASS_KEY_SET.has(key)) return;
    state.passes[key] = t.checked;
    renderPasses();
    persist();
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
      b.innerHTML = '<span aria-hidden="true">■</span> '+esc(tMsg('panel.stopping'));
      vscode.postMessage({type:'cancelReview'});
      return;
    }
    if ($('#btn-start').getAttribute('aria-disabled') === 'true') return;
    vscode.postMessage({
      type:'startReview',
      base: state.selectedBase,
      head: state.selectedHead,
      passes: Object.assign({}, state.passes),
    });
  });
  $('#btn-resume').addEventListener('click', () => {
    if (!state.partial || state.isRunning) return;
    vscode.postMessage({type:'resumeReview'});
  });
  $('#btn-discard-partial').addEventListener('click', () => {
    if (!state.partial || state.isRunning) return;
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
    }
  }, 1000);
`;
