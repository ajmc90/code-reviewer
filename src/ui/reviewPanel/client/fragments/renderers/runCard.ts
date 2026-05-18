/**
 * Run card — the big Start/Stop button area below the branch picker.
 *
 * The card has three visual states reflected via data-state on .run-card:
 *   blocked  → missing branches/passes, button disabled, helpful message
 *   ready    → user can press Start, chips show preview info
 *   running  → button becomes Stop, chips switch to live progress
 *
 * Reads heavily from state (passes, selectedBase/Head, isRunning, findings,
 * runStartedAt, currentPhase).
 */
export const RUN_CARD = `
  function renderRunCard(){
    const card = $('#run-card');
    if (!card) return;
    const chipsEl = $('#run-chips');
    const msgEl = $('#run-msg');
    const btn = $('#btn-start');
    const btnLabel = btn && btn.querySelector('.run-card__btn-label');
    const btnIcon = btn && btn.querySelector('.run-card__btn-icon');
    if (!chipsEl || !msgEl || !btn || !btnLabel || !btnIcon) return;

    // ── Running ────────────────────────────────────────────────
    if (state.isRunning){
      card.dataset.state = 'running';
      btn.classList.remove('btn--primary');
      btn.classList.add('btn--danger');
      btn.setAttribute('aria-disabled', 'false');
      btn.setAttribute('aria-label', tMsg('branch.stopRunningAria'));
      btn.title = tMsg('branch.cancelInProgress');
      btnIcon.textContent = '■';
      btnLabel.textContent = tMsg('run.stop');
      chipsEl.innerHTML = buildRunningChips();
      msgEl.textContent = '';
      msgEl.removeAttribute('data-tone');
      return;
    }

    // ── Idle / Ready / Blocked ─────────────────────────────────
    btn.classList.add('btn--primary');
    btn.classList.remove('btn--danger');
    btn.removeAttribute('title');
    btnIcon.textContent = '▶';
    btnLabel.textContent = tMsg('run.start');

    const hasBase = !!state.selectedBase;
    const hasHead = !!state.selectedHead;
    const sameBranch = hasBase && hasHead && state.selectedBase === state.selectedHead;
    const passActive = Object.values(state.passes).some(Boolean);
    const branchesOk = hasBase && hasHead && !sameBranch;
    const ok = branchesOk && passActive;

    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    btn.setAttribute('aria-label', ok
      ? tMsg('branch.reviewVsAria', {head: state.selectedHead, base: state.selectedBase})
      : tMsg('panel.runSectionAria'));

    card.dataset.state = ok ? 'ready' : 'blocked';

    chipsEl.innerHTML = buildIdleChips({ hasBase, hasHead, sameBranch, passActive });

    // ── Helper message: pick the most actionable one ──────────
    let msg = '';
    let tone = '';
    if (!branchesOk && !passActive){
      msg = tMsg('run.needsBranches');
      tone = 'warn';
    } else if (sameBranch){
      msg = tMsg('run.sameBranch');
      tone = 'warn';
    } else if (!branchesOk){
      msg = tMsg('run.needsBranches');
      tone = 'warn';
    } else if (!passActive){
      msg = tMsg('run.needsPasses');
      tone = 'warn';
    }
    msgEl.textContent = msg;
    if (tone) msgEl.setAttribute('data-tone', tone);
    else msgEl.removeAttribute('data-tone');
  }

  /** Idle/ready chips: branches · passes. */
  function buildIdleChips({ hasBase, hasHead, sameBranch, passActive }){
    const chips = [];

    // Branches chip
    if (hasBase && hasHead && !sameBranch){
      const ariaLabel = tMsg('run.chipBranchesAria', { head: state.selectedHead, base: state.selectedBase });
      chips.push(
        '<span class="run-chip" data-tone="branches" title="'+escAttr(ariaLabel)+'" aria-label="'+escAttr(ariaLabel)+'">' +
          '<span class="run-chip__icon" aria-hidden="true">⎇</span>' +
          '<span class="run-chip__val">'+esc(state.selectedHead)+' ← '+esc(state.selectedBase)+'</span>' +
        '</span>'
      );
    } else {
      chips.push(
        '<span class="run-chip" data-tone="branches" data-empty="1">' +
          '<span class="run-chip__icon" aria-hidden="true">⎇</span>' +
          '<span class="run-chip__val">'+esc(tMsg('run.chipBranchesNone'))+'</span>' +
        '</span>'
      );
    }

    // Passes chip
    const activeCount = Object.values(state.passes).filter(Boolean).length;
    if (activeCount > 0){
      const text = activeCount === 1 ? tMsg('run.chipPassesOne') : tMsg('run.chipPasses', { count: activeCount });
      chips.push(
        '<span class="run-chip" data-tone="passes">' +
          '<span class="run-chip__icon" aria-hidden="true">▣</span>' +
          '<span class="run-chip__val">'+esc(text)+'</span>' +
        '</span>'
      );
    } else {
      chips.push(
        '<span class="run-chip" data-tone="passes" data-empty="1">' +
          '<span class="run-chip__icon" aria-hidden="true">▣</span>' +
          '<span class="run-chip__val">'+esc(tMsg('run.chipNoPasses'))+'</span>' +
        '</span>'
      );
    }

    return chips.join('');
  }

  /** Running chips: phase progress + findings count + elapsed time. */
  function buildRunningChips(){
    const chips = [];
    // Phase chip (uses PHASE_ORDER for total). Falls back to "Preparing…" until
    // the first phaseStart event arrives.
    const phaseIdx = state.currentPhase ? PHASE_ORDER.indexOf(state.currentPhase) + 1 : 0;
    if (phaseIdx > 0){
      const label = phaseLabel(state.currentPhase);
      chips.push(
        '<span class="run-chip" data-tone="phase">' +
          '<span class="run-chip__icon" aria-hidden="true">◐</span>' +
          '<span class="run-chip__val">'+esc(tMsg('run.runningPhase', { current: phaseIdx, total: PHASE_ORDER.length, label }))+'</span>' +
        '</span>'
      );
    } else {
      chips.push(
        '<span class="run-chip" data-tone="phase">' +
          '<span class="run-chip__icon" aria-hidden="true">◐</span>' +
          '<span class="run-chip__val">'+esc(tMsg('run.runningPreparing'))+'</span>' +
        '</span>'
      );
    }

    // Findings + elapsed chip — show what the user is actually seeing in the
    // grid (visible findings only), not the audit-trail total.
    const count = state.findings.filter(function(f){
      return !f.dismissed && f.decision !== 'drop' && f.decision !== 'merge';
    }).length;
    const elapsed = state.runStartedAt ? fmtElapsed(Date.now() - state.runStartedAt) : '0s';
    const text = count === 1
      ? tMsg('run.runningFindingsOne', { elapsed })
      : tMsg('run.runningFindings', { count, elapsed });
    chips.push(
      '<span class="run-chip" data-tone="findings">' +
        '<span class="run-chip__icon" aria-hidden="true">⚑</span>' +
        '<span class="run-chip__val">'+esc(text)+'</span>' +
      '</span>'
    );

    return chips.join('');
  }
`;
