/**
 * Host → webview message router. The orchestrator sends events via
 * panel.webview.postMessage; here we route by m.type.
 *
 * Also includes the initial paint sequence + the ready postMessage that
 * signals the host to flush its event buffer to us. Must run after every
 * other fragment so all the render functions it touches are defined.
 */
export const MESSAGE_ROUTER = `
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'event') applyEvent(m.event);
    else if (m.type === 'result') applyResult(m.result);
    else if (m.type === 'branches') applyBranches(m);
    else if (m.type === 'fetchStart'){
      state.fetching = true;
      const b = $('#btn-fetch'); b.setAttribute('aria-disabled','true'); b.innerHTML = '<span aria-hidden="true">⟳</span> Fetching…';
      const errEl = $('#branch-error'); errEl.textContent = ''; errEl.setAttribute('data-empty', '1');
    } else if (m.type === 'fetchDone'){
      state.fetching = false;
      const b = $('#btn-fetch'); b.removeAttribute('aria-disabled'); b.innerHTML = '<span aria-hidden="true">⟳</span> Fetch';
      appendLive('info', '[fetch] ' + (m.output||'').trim());
    } else if (m.type === 'fetchError'){
      state.fetching = false;
      const b = $('#btn-fetch'); b.removeAttribute('aria-disabled'); b.innerHTML = '<span aria-hidden="true">⟳</span> '+esc(tMsg('panel.fetch'));
      const errEl = $('#branch-error'); errEl.textContent = tMsg('log.fetchFailed', {message: m.message}); errEl.removeAttribute('data-empty');
    } else if (m.type === 'fetchPrompt'){
      const b = $('#btn-fetch'); b.innerHTML = '<span aria-hidden="true">🔐</span> ' + esc(m.message.replace(/\\.{3,}$/,'…'));
      appendLive('warn', '[fetch] '+m.message);
    } else if (m.type === 'branchError'){
      const errEl = $('#branch-error');
      if (m.message){ errEl.textContent = m.message; errEl.removeAttribute('data-empty') }
      else { errEl.textContent = ''; errEl.setAttribute('data-empty', '1') }
    } else if (m.type === 'aheadBehind'){
      if (m.reqId !== state.abReqId) return;
      state.abResult = m.result; renderAB();
    } else if (m.type === 'diffStat'){
      if (m.reqId !== state.diffStatReqId) return;
      state.diffStat = m.result; // {filesChanged, additions, deletions} | null
      renderRunCard();
      const est = $('#passes-estimate');
      if (est) est.textContent = activePassCount() === 0 ? '' : formatEstimate();
    } else if (m.type === 'calibration'){
      state.calibration = m.snapshot || { ratios: {} };
      // TEMP DIAGNOSTIC: dump the snapshot so we can see what the host is sending.
      console.log('[claude-review] calibration snapshot received:', JSON.stringify(state.calibration));
      console.log('[claude-review] active passes:', Object.keys(state.passes).filter(k => state.passes[k]));
      // Re-render estimate-bearing surfaces so the calibrated numbers replace
      // whatever default we showed during initial load.
      renderRunCard();
      const est = $('#passes-estimate');
      if (est) est.textContent = activePassCount() === 0 ? '' : formatEstimate();
    } else if (m.type === 'partialSummary'){
      state.partial = m.summary || null;
      renderResumeBanner();
      // Per-step Retry visibility depends on partial existing.
      renderTimeline();
    } else if (m.type === 'findingTranslationPending'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){ f._translating = true; rerenderFinding(m.id); }
    } else if (m.type === 'findingTranslated'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){
        f.translations = Object.assign({}, f.translations || {}, { [m.lang]: m.fields });
        f.displayLang = m.lang;
        delete f._translating;
        rerenderFinding(m.id);
      }
    } else if (m.type === 'findingTranslationError'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){ delete f._translating; rerenderFinding(m.id); }
    }
  });

  // Initial paint so empty states render before any events arrive.
  applyLeftWidth();
  applyCollapsed();
  applyAdvancedOpen();
  renderPasses();
  renderActivePasses();
  renderTimeline();
  renderChangeMap();
  renderFindings();
  renderRunCard();
  bumpCounter();

  vscode.postMessage({type:'ready'});
`;
