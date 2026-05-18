/**
 * Compact summary rail shown when the user collapses the left pane.
 * Reduces the whole left side to a single vertical column with a status
 * dot, current pass, branch pair, and a tiny severity counter strip.
 *
 * Re-rendered whenever bumpCounter() fires while collapsed.
 */
export const RAIL = `
  function renderRail(){
    const dot = $('#rail-dot');
    const passWrap = $('#rail-pass');
    const branchesEl = $('#rail-branches');
    if (!dot) return;
    let state2 = 'idle';
    if (state.isRunning) state2 = 'running';
    else if (state.result){
      const v = state.result.summary && state.result.summary.overallVerdict;
      state2 = (v === 'block' || v === 'needs-changes') ? 'error' : 'done';
    }
    dot.dataset.state = state2;
    let branchesText = '';
    if (state.selectedHead && state.selectedBase){
      branchesText = state.selectedHead + ' ← ' + state.selectedBase;
    } else if (state.result){
      branchesText = (state.result.summary.branch||'') + ' ← ' + (state.result.summary.baseBranch||'');
    }
    branchesEl.textContent = branchesText;
    branchesEl.title = branchesText;
    // Current pass
    let passText = '';
    let running = null;
    for (const [k, v] of state.steps){
      if (v && v.status === 'running'){ running = { k, v }; break }
    }
    if (running) passText = passLabelLong(running.k);
    else if (!state.isRunning && state.result){
      const c = state.result.findings
        ? state.result.findings.filter(f => !f.dismissed && f.decision !== 'drop' && f.decision !== 'merge').length
        : 0;
      passText = c + ' findings';
    } else if (!state.isRunning){
      passText = 'idle';
    } else {
      passText = 'starting…';
    }
    passWrap.textContent = passText;
    passWrap.title = passText;
    // Counters — match bumpCounter: skip dismissed + critique-decisioned rows
    // so the rail and the top-right strip never disagree.
    const counts = {critical:0, major:0, minor:0, nit:0};
    for (const f of state.findings){
      if (f.dismissed) continue;
      if (f.decision === 'drop' || f.decision === 'merge') continue;
      if (counts[f.severity] != null) counts[f.severity]++;
    }
    $('#rail-c-critical').textContent = counts.critical;
    $('#rail-c-major').textContent    = counts.major;
    $('#rail-c-minor').textContent    = counts.minor;
    $('#rail-c-nit').textContent      = counts.nit;
    // Tag empty stats so the stacked-collapsed view can hide them — reduces
    // strip clutter when half the severities are zero (the common case).
    const stats = [
      ['#rail-c-critical', counts.critical],
      ['#rail-c-major', counts.major],
      ['#rail-c-minor', counts.minor],
      ['#rail-c-nit', counts.nit],
    ];
    for (const [sel, n] of stats){
      const el = $(sel);
      if (!el) continue;
      const stat = el.closest('.rail-stat');
      if (stat) stat.setAttribute('data-zero', n === 0 ? '1' : '0');
    }
  }
`;
