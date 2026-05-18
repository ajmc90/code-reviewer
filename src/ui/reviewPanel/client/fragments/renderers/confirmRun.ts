/**
 * Confirmation modal shown when the user presses RUN and the estimated cost
 * exceeds a threshold. Default threshold: 200,000 tokens. Configurable via
 * setting (read by the host and surfaced to the client through the estimate
 * payload — kept simple by hardcoding here for now; PR 3.4 may add a UI knob).
 *
 * Two actions:
 *   • Cancel — close modal, do nothing.
 *   • Run anyway — dispatch startReview as-is.
 *
 * Note: an earlier draft included a "Run with depth=balanced" shortcut, but
 * since startReview currently doesn't accept a depth override (the
 * orchestrator reads depth from settings.json at run time), the shortcut
 * would lie about its effect. The Advanced Options panel in PR 3.4 will let
 * the user change depth before clicking RUN, which is the clean path.
 *
 * The user can opt out of future confirmations under a chosen threshold via
 * a checkbox. That preference lives in vscode.getState() (panel-local) rather
 * than settings.json because it's a UX nudge, not a project config.
 */
export const CONFIRM_RUN = `
  // Default token threshold above which we ask for confirmation. Roughly
  // 30-40% of a typical 5-hour Pro subscription window — large enough that a
  // user should pause and look at the estimate before committing.
  const CONFIRM_THRESHOLD_TOKENS_DEFAULT = 200000;

  function dispatchStartReview(passesOverride){
    const passes = passesOverride || Object.assign({}, state.passes);
    vscode.postMessage({
      type: 'startReview',
      base: state.selectedBase,
      head: state.selectedHead,
      passes,
    });
  }

  /**
   * Decide whether to show the confirmation modal or start the review directly.
   * Skipped when:
   *   • No estimate is available yet (we can't make an informed warning).
   *   • Estimate is below the user's chosen threshold (their suppression pref
   *     or the default).
   */
  function maybeConfirmAndStart(){
    const est = state.estimate;
    if (!est){
      // No estimate (no branches yet, or pre-run fetch in flight). Defer to
      // the click handler's other guards — if branches are missing it would
      // be aria-disabled.
      dispatchStartReview();
      return;
    }
    const persisted = (vscode.getState && vscode.getState()) || {};
    const userThreshold = typeof persisted.costConfirmThreshold === 'number'
      ? persisted.costConfirmThreshold
      : CONFIRM_THRESHOLD_TOKENS_DEFAULT;
    if (est.centralTokens < userThreshold){
      dispatchStartReview();
      return;
    }
    openCostConfirmModal();
  }

  function fmtTokensCompact(n){
    if (!Number.isFinite(n)) return '?';
    if (n < 1000) return String(n);
    if (n < 10000) return (n/1000).toFixed(1) + 'K';
    if (n < 1000000) return Math.round(n/1000) + 'K';
    return (n/1000000).toFixed(1) + 'M';
  }

  // Snap an estimated token count up to the next "round" threshold so the
  // suppression preference reads naturally. Tiers double-ish each step.
  const CONFIRM_TIERS = [100000, 250000, 500000, 1000000, 2000000, 5000000, 10000000];
  function nextCleanThresholdTier(tokens){
    for (const t of CONFIRM_TIERS) if (t > tokens) return t;
    // Past the largest tier — let the user run anything (effectively disable
    // the modal). The default threshold is still in effect on a fresh state.
    return Number.MAX_SAFE_INTEGER;
  }

  function openCostConfirmModal(){
    const existing = document.getElementById('cost-confirm');
    if (existing) existing.remove();
    const est = state.estimate;
    if (!est) return;

    const overlay = document.createElement('div');
    overlay.id = 'cost-confirm';
    overlay.className = 'cost-confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cost-confirm-title');

    const lineCount = (est.linesAdded || 0) + (est.linesRemoved || 0);
    const diffSummaryLine = est.filesChanged
      ? tMsg('cost.confirmDiffStat', {
          files: est.filesChanged,
          lines: lineCount,
        })
      : '';

    const factorsHtml = (est.factors || []).map(f => '<li>'+esc(f)+'</li>').join('');

    overlay.innerHTML =
      '<div class="cost-confirm-modal" role="document">' +
        '<header class="cost-confirm-modal__head">' +
          '<h3 id="cost-confirm-title" class="cost-confirm-modal__title">' +
            '<span class="cost-confirm-modal__icon" aria-hidden="true">⚠</span> ' +
            esc(tMsg('cost.confirmTitle')) +
          '</h3>' +
          '<button type="button" class="cost-confirm-modal__close" aria-label="' + escAttr(tMsg('cost.close')) + '">×</button>' +
        '</header>' +

        '<div class="cost-confirm-modal__body">' +
          // Headline: the one number that matters most, with range below.
          '<div class="cost-confirm-modal__headline">' +
            '<div class="cost-confirm-modal__big">' +
              '~' + fmtTokensCompact(est.centralTokens) + ' ' +
              '<span class="cost-confirm-modal__unit">' + esc(tMsg('cost.tokensUnit')) + '</span>' +
            '</div>' +
            '<div class="cost-confirm-modal__sub">' +
              esc(tMsg('cost.confirmRange', {
                low: fmtTokensCompact(est.lowTokens),
                high: fmtTokensCompact(est.highTokens),
                worst: fmtTokensCompact(est.worstCaseTokens),
              })) +
            '</div>' +
          '</div>' +

          // "What's in this review" — diff stats + factors in a single
          // visually-grouped block so the body has structure instead of
          // floating gray text.
          ((diffSummaryLine || factorsHtml)
            ? '<section class="cost-confirm-modal__details">' +
                '<h4 class="cost-confirm-modal__details-title">' + esc(tMsg('cost.confirmWhatsInside')) + '</h4>' +
                (diffSummaryLine
                  ? '<p class="cost-confirm-modal__diff">' + esc(diffSummaryLine) + '</p>'
                  : '') +
                (factorsHtml
                  ? '<ul class="cost-confirm-modal__factors">' + factorsHtml + '</ul>'
                  : '') +
              '</section>'
            : '') +

          // Subscription warning — gets its own block with left accent so it
          // reads as a callout, not as part of the details list.
          '<aside class="cost-confirm-modal__warn" role="note">' +
            '<span class="cost-confirm-modal__warn-icon" aria-hidden="true">ⓘ</span>' +
            '<span>' + esc(tMsg('cost.confirmSubWarn')) + '</span>' +
          '</aside>' +

          '<label class="cost-confirm-modal__suppress">' +
            '<input type="checkbox" id="cost-confirm-suppress"/> ' +
            '<span>' + esc(tMsg('cost.confirmSuppress', { tokens: fmtTokensCompact(nextCleanThresholdTier(est.centralTokens)) })) + '</span>' +
          '</label>' +
        '</div>' +

        '<footer class="cost-confirm-modal__actions">' +
          '<button type="button" class="btn btn--ghost" data-action="cancel">' +
            esc(tMsg('cost.confirmCancel')) +
          '</button>' +
          '<button type="button" class="btn btn--primary" data-action="confirm">' +
            esc(tMsg('cost.confirmRun')) +
          '</button>' +
        '</footer>' +
      '</div>';

    document.body.appendChild(overlay);

    // Focus the cancel button by default — pressing Escape or Enter on Cancel
    // is the safe path. Users who want to run can Tab forward.
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    if (cancelBtn && cancelBtn instanceof HTMLElement) cancelBtn.focus();

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape'){
        ev.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      // Click on backdrop (overlay itself, not the modal) closes.
      if (target === overlay){ close(); return; }
      const action = target.closest('[data-action]');
      if (!action) return;
      const a = action.getAttribute('data-action');
      if (a === 'cancel'){ close(); return; }

      // Persist the suppression preference if checked, BEFORE we close so the
      // next run already respects it. Round the new threshold up to the next
      // clean tier (100K / 250K / 500K / 1M / 2M / 5M) so suppression is
      // intuitive: a user accepting a 250K run silences the modal for runs
      // up to 500K, not "up to ~275K which is hard to predict."
      const sup = overlay.querySelector('#cost-confirm-suppress');
      if (sup && sup.checked){
        const persisted = (vscode.getState && vscode.getState()) || {};
        const newThreshold = nextCleanThresholdTier(est.centralTokens);
        vscode.setState && vscode.setState(Object.assign({}, persisted, { costConfirmThreshold: newThreshold }));
      }

      if (a === 'confirm'){
        close();
        dispatchStartReview();
      }
    });
  }
`;
