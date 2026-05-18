/**
 * Cost pill — surfaces the estimated cost of the review BEFORE the user
 * presses RUN. Reads from state.estimate (set by the host's 'estimate'
 * message). Renders into #cost-pill placed inside the run card chips row.
 *
 * Two interaction modes:
 *   - Compact chip: shows "~95K tokens · ~6 min · $0.45 ref" (or just spinner
 *     while a request is in flight).
 *   - Click → opens a popover with the per-pass breakdown + factors.
 *
 * Tokens are the primary metric; USD reference is shown smaller with a
 * disclaimer for subscription users (they don't pay per-token).
 */
export const COST_PILL = `
  // ── Triggering: ask the host for an estimate ─────────────────
  // Debounced because the user might toggle several passes in quick
  // succession; we don't want to fire a git diff per toggle.
  let __estimateDebounce = null;
  let __estimateReqId = '';
  function requestEstimate(){
    if (__estimateDebounce){ clearTimeout(__estimateDebounce); __estimateDebounce = null; }
    if (!state.selectedBase || !state.selectedHead || state.selectedBase === state.selectedHead){
      state.estimate = null;
      state.estimateLoading = false;
      renderCostPill();
      return;
    }
    state.estimateLoading = true;
    renderCostPill();
    __estimateDebounce = setTimeout(() => {
      __estimateDebounce = null;
      const reqId = String(Math.random());
      __estimateReqId = reqId;
      vscode.postMessage({
        type: 'requestEstimate',
        reqId,
        base: state.selectedBase,
        head: state.selectedHead,
        passes: Object.assign({}, state.passes),
        depth: state.depth || 'deep',
        useSessionReuse: state.useSessionReuse !== false,
      });
    }, 250);
  }

  // Host → client: 'estimate' message handler. Routed from messageRouter.
  function applyEstimate(msg){
    if (msg.reqId !== __estimateReqId) return;  // stale response
    state.estimateLoading = false;
    if (msg.error || msg.empty){
      state.estimate = null;
    } else {
      state.estimate = {
        centralTokens: msg.estimate.centralTokens,
        lowTokens: msg.estimate.lowTokens,
        highTokens: msg.estimate.highTokens,
        worstCaseTokens: msg.estimate.worstCaseTokens,
        centralUsd: msg.estimate.centralUsd,
        lowUsd: msg.estimate.lowUsd,
        highUsd: msg.estimate.highUsd,
        worstCaseUsd: msg.estimate.worstCaseUsd,
        byPass: msg.estimate.byPass || [],
        factors: msg.estimate.factors || [],
        confidence: msg.estimate.confidence,
        estimatedDurationSec: msg.estimate.estimatedDurationSec,
        filesChanged: msg.filesChanged,
        linesAdded: msg.linesAdded,
        linesRemoved: msg.linesRemoved,
      };
    }
    renderCostPill();
  }

  // ── Rendering ─────────────────────────────────────────────────
  function fmtTokens(n){
    if (!Number.isFinite(n)) return '?';
    if (n < 1000) return String(n);
    if (n < 10000) return (n/1000).toFixed(1) + 'K';
    if (n < 1000000) return Math.round(n/1000) + 'K';
    return (n/1000000).toFixed(1) + 'M';
  }
  function fmtDuration(sec){
    if (!Number.isFinite(sec) || sec <= 0) return '?';
    if (sec < 60) return Math.round(sec) + 's';
    return Math.round(sec/60) + ' min';
  }
  function costPillTone(tokens){
    // Heuristic thresholds tuned to typical subscription usage budgets.
    // <50K = trivial, 50-200K = normal, 200-500K = large, >500K = very large.
    if (tokens < 50000) return 'low';
    if (tokens < 200000) return 'medium';
    if (tokens < 500000) return 'high';
    return 'very-high';
  }
  function renderCostPill(){
    const pill = $('#cost-pill');
    if (!pill) return;
    if (state.isRunning){
      // While a review is running, the chip area shows live progress;
      // hide the cost pill so it doesn't compete for attention.
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    if (state.estimateLoading){
      pill.innerHTML = '<span class="cost-pill__icon" aria-hidden="true">◌</span><span class="cost-pill__val">'+esc(tMsg('cost.estimating'))+'</span>';
      pill.removeAttribute('data-tone');
      pill.setAttribute('aria-busy', 'true');
      return;
    }
    pill.removeAttribute('aria-busy');
    const est = state.estimate;
    if (!est){
      pill.innerHTML = '<span class="cost-pill__icon" aria-hidden="true">◌</span><span class="cost-pill__val">'+esc(tMsg('cost.unknown'))+'</span>';
      pill.removeAttribute('data-tone');
      return;
    }
    const tone = costPillTone(est.centralTokens);
    pill.setAttribute('data-tone', tone);
    const label = tMsg('cost.summary', {
      tokens: fmtTokens(est.centralTokens),
      duration: fmtDuration(est.estimatedDurationSec),
    });
    // Confidence badge: tiny pill at the end so the user can see at a glance
    // whether this estimate is heuristic-only (cold) or has been calibrated
    // against their own past runs (partial/calibrated).
    const conf = est.confidence || 'cold';
    const confBadge = '<span class="cost-pill__conf" data-conf="' + esc(conf) + '" title="' + escAttr(tMsg('cost.conf.tooltip.' + conf)) + '">' + esc(tMsg('cost.conf.' + conf)) + '</span>';
    pill.innerHTML =
      '<span class="cost-pill__icon" aria-hidden="true">◆</span>' +
      '<span class="cost-pill__val">' + esc(label) + '</span>' +
      confBadge +
      '<span class="cost-pill__hint" aria-hidden="true">▾</span>';
    pill.title = tMsg('cost.tooltipShow');
  }

  // ── Breakdown popover ────────────────────────────────────────
  function toggleCostBreakdown(){
    const existing = document.getElementById('cost-breakdown');
    if (existing){ existing.remove(); return; }
    const est = state.estimate;
    if (!est) return;
    const pill = $('#cost-pill');
    if (!pill) return;
    const pop = document.createElement('div');
    pop.id = 'cost-breakdown';
    pop.className = 'cost-breakdown';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', tMsg('cost.breakdownAria'));
    const rows = (est.byPass || []).map(p => {
      return '<tr><td class="pass">'+esc(p.pass)+'</td>' +
             '<td class="tok">~'+fmtTokens(p.tokens)+'</td></tr>';
    }).join('');
    const factors = (est.factors || []).map(f => '<li>'+esc(f)+'</li>').join('');
    pop.innerHTML =
      '<div class="cost-breakdown__head">' +
        '<strong>'+esc(tMsg('cost.breakdownTitle'))+'</strong>' +
        '<button class="cost-breakdown__close" aria-label="'+escAttr(tMsg('cost.close'))+'">×</button>' +
      '</div>' +
      '<table class="cost-breakdown__table">' +
        '<colgroup>' +
          '<col class="pass-col"/>' +
          '<col class="tok-col"/>' +
        '</colgroup>' +
        '<thead><tr>' +
          '<th class="pass-col-h">'+esc(tMsg('cost.passColumn'))+'</th>' +
          '<th class="tok-col-h">'+esc(tMsg('cost.tokensColumn'))+'</th>' +
        '</tr></thead>' +
        '<tbody>'+rows+'</tbody>' +
        '<tfoot><tr>' +
          '<td class="pass">'+esc(tMsg('cost.total'))+'</td>' +
          '<td class="tok">~'+fmtTokens(est.centralTokens)+'</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div class="cost-breakdown__range">' +
        esc(tMsg('cost.range', { low: fmtTokens(est.lowTokens), high: fmtTokens(est.highTokens), worst: fmtTokens(est.worstCaseTokens) })) +
      '</div>' +
      (factors ? '<ul class="cost-breakdown__factors">'+factors+'</ul>' : '');
    pill.parentElement.appendChild(pop);
    // Auto-position: prefer to open in the direction that has more room.
    // Default CSS opens upward; switch to downward when there's >300px below
    // the pill and more space below than above. This avoids covering the
    // branch picker on tall panels while still working on short ones.
    requestAnimationFrame(() => {
      const pillRect = pill.getBoundingClientRect();
      const popHeight = pop.offsetHeight;
      const viewportH = window.innerHeight;
      const spaceAbove = pillRect.top;
      const spaceBelow = viewportH - pillRect.bottom;
      if (spaceBelow >= popHeight + 20 && spaceBelow > spaceAbove){
        pop.classList.add('cost-breakdown--below');
      } else if (spaceAbove < popHeight + 40 && spaceBelow < popHeight + 40){
        // Neither side has room — fall back to centered modal style so the
        // popover scrolls cleanly instead of being clipped at top/bottom.
        pop.classList.add('cost-breakdown--centered');
      }
    });
    pop.querySelector('.cost-breakdown__close').addEventListener('click', () => pop.remove());
    // Click outside closes.
    setTimeout(() => {
      const onDocClick = (ev) => {
        if (!pop.contains(ev.target) && ev.target !== pill && !pill.contains(ev.target)){
          pop.remove();
          document.removeEventListener('click', onDocClick);
        }
      };
      document.addEventListener('click', onDocClick);
    }, 0);
  }
`;
