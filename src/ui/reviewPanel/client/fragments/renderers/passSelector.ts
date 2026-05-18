/**
 * Passes selector — the editable pill checkboxes (advanced view), the
 * read-only chip row that summarizes phases by active count, plus the
 * preset application logic.
 *
 * renderPasses owns the advanced view and also pokes the chip row and the
 * start button so the entire passes area stays in sync.
 * applyPreset mutates state.passes and re-renders.
 */
export const PASS_SELECTOR = `
  /**
   * Render the read-only "active passes" chip row that lives between the
   * presets and the Advanced toggle. Groups by phase so the user gets a quick
   * sense of which phases will run without expanding the editable list.
   */
  function renderActivePasses(){
    const root = $('#active-passes');
    if (!root) return;
    const groups = [];
    let totalActive = 0;
    for (const phase of PHASE_ORDER){
      const inPhase = PASS_DEFS.filter(d => d.phase === phase);
      if (inPhase.length === 0) continue;
      const onCount = inPhase.filter(d => state.passes[d.key]).length;
      totalActive += onCount;
      const off = onCount === 0;
      const names = inPhase.filter(d => state.passes[d.key]).map(d => passLabel(d.key));
      const title = off
        ? phaseLabel(phase) + ' — none'
        : phaseLabel(phase) + ': ' + names.join(', ');
      groups.push(
        '<span class="active-passes__group'+(off?' active-passes__group--off':'')+'" title="'+escAttr(title)+'">' +
          '<span class="active-passes__group-label">'+esc(phaseLabel(phase))+'</span>' +
          '<span class="active-passes__group-count">'+onCount+'/'+inPhase.length+'</span>' +
        '</span>'
      );
    }
    if (totalActive === 0){
      root.innerHTML = '<span class="active-passes__empty">'+esc(tMsg('panel.activeNone'))+'</span>';
    } else {
      root.innerHTML = groups.join('');
    }
  }

  function applyAdvancedOpen(){
    const pane = $('#advanced-passes');
    const btn = $('#btn-toggle-advanced');
    if (!pane || !btn) return;
    const open = !!state.advancedOpen;
    pane.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = btn.querySelector('.advanced-toggle__label');
    if (label) label.textContent = tMsg(open ? 'panel.advancedHide' : 'panel.advancedShow');
  }

  function renderPasses(){
    const root = $('#passes');
    if (!root) return;
    let active = 0;
    const groupsHtml = [];
    for (const phase of PHASE_ORDER){
      const inPhase = PASS_DEFS.filter(d => d.phase === phase);
      if (inPhase.length === 0) continue;
      const pills = [];
      for (const def of inPhase){
        const on = !!state.passes[def.key];
        if (on) active++;
        const conditionalNote = def.conditional
          ? '<span class="pass-tip__detail">'+esc(tMsg('passes.conditional.'+def.conditional))+'</span>'
          : '';
        pills.push(
          '<label class="pass-pill" data-key="'+escAttr(def.key)+'">' +
            '<input type="checkbox" data-pass="'+escAttr(def.key)+'"'+(on?' checked':'')+' aria-describedby="pass-tip-'+escAttr(def.key)+'">' +
            '<span class="pass-pill__label">'+esc(passLabel(def.key))+'</span>' +
            '<span class="pass-tip" id="pass-tip-'+escAttr(def.key)+'" role="tooltip">' +
              '<span class="pass-tip__title">'+esc(passLabel(def.key))+'</span>' +
              '<span class="pass-tip__hint">'+esc(passHint(def.key))+'</span>' +
              '<span class="pass-tip__detail">'+esc(passDetail(def.key))+'</span>' +
              conditionalNote +
            '</span>' +
          '</label>'
        );
      }
      groupsHtml.push(
        '<div class="pass-group" data-phase="'+escAttr(phase)+'" title="'+escAttr(phaseHint(phase))+'">' +
          '<div class="pass-group__h">'+esc(phaseLabel(phase))+'</div>' +
          '<div class="pass-group__pills">'+pills.join('')+'</div>' +
        '</div>'
      );
    }
    root.innerHTML = groupsHtml.join('');
    const total = PASS_DEFS.length;
    $('#passes-count').textContent = active === total ? '('+tMsg('panel.selectAll').toLowerCase()+')' : '('+active+'/'+total+')';
    // Highlight matching preset (if any).
    const activePreset = matchingPresetName();
    for (const btn of document.querySelectorAll('.preset')){
      btn.setAttribute('aria-pressed', btn.dataset.preset === activePreset ? 'true' : 'false');
    }
    // Keep the collapsed-view active-pass chips in sync with checkbox state.
    renderActivePasses();
    syncStartBtn();
  }
  /** Currently-matching preset name, or null if no exact match. */
  function matchingPresetName(){
    const active = new Set();
    for (const def of PASS_DEFS) if (state.passes[def.key]) active.add(def.key);
    for (const [name, keys] of Object.entries(PASS_PRESETS)){
      if (active.size !== keys.length) continue;
      if (keys.every(k => active.has(k))) return name;
    }
    return null;
  }
  function applyPreset(name){
    const keys = PASS_PRESETS[name];
    if (!keys) return;
    const setKeys = new Set(keys);
    for (const def of PASS_DEFS) state.passes[def.key] = setKeys.has(def.key);
    renderPasses();
    persist();
    requestEstimate();
  }
  function syncStartBtn(){
    // The Run card is the source of truth for button visual + enable state.
    renderRunCard();
  }
`;
