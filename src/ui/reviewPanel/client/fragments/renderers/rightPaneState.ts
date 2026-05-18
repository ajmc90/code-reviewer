/**
 * Right pane "state surface" — what fills the right pane when there is no
 * findings card to render. Three modes:
 *
 *   idle (welcome)        no review running, no findings, no result
 *                         → hero + branch/diff preview + 4 phase cards
 *                         + CTA mirror of the left Start button + tips
 *   in-progress           isRunning is true, no findings have arrived yet
 *                         → tokens used live + files reviewed (changeMap)
 *                         + skeleton placeholders + waiting hint
 *   message               clean review (zero findings) or filter mismatch
 *                         → short text message, same vertical centering
 *
 * When at least one finding exists, this surface stays hidden and the
 * findings grid owns the space; the in-progress signals migrate to the
 * sticky header (rendered by renderInProgressHeader, below).
 *
 * All three modes share one container (#right-state) so the transition
 * between them is a single innerHTML swap — no z-index dance, no
 * cross-fade glitches.
 */
export const RIGHT_PANE_STATE = `
  /** Sum of all per-pass token usage so far. Tokens are the universal unit —
   *  billing varies between subscription and API users, so we never surface
   *  dollar amounts in the UI. */
  function tokensSpentSoFar(){
    let total = 0;
    state.steps.forEach(function(info){
      const m = info && info.metrics;
      if (!m) return;
      if (typeof m.inTokens === 'number') total += m.inTokens;
      if (typeof m.outTokens === 'number') total += m.outTokens;
    });
    return total;
  }

  function estimatedTokens(){
    const e = state.estimate;
    if (!e) return null;
    // estimate carries a tokens object with input/output projections; we add
    // them so the displayed value matches what we compare against.
    if (typeof e.totalTokens === 'number') return e.totalTokens;
    const t = e.tokens || {};
    const sum = (t.input || 0) + (t.output || 0) + (t.cacheCreate || 0) + (t.cacheRead || 0);
    return sum > 0 ? sum : null;
  }

  function fmtTokenCount(n){
    if (n == null || !isFinite(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
    return String(Math.round(n));
  }

  function visibleFindingsCount(){
    let n = 0;
    for (let i = 0; i < state.findings.length; i++){
      const f = state.findings[i];
      if (f.dismissed) continue;
      if (f.decision === 'drop' || f.decision === 'merge') continue;
      n++;
    }
    return n;
  }

  /** Detect the host OS via navigator.platform. Used to pick which
   *  shortcut to bold (Cmd vs Ctrl). Falls back to "mac-ish" — most
   *  Claude Code users are on macOS today. */
  function isMacLike(){
    const p = (navigator && navigator.platform) || '';
    return /Mac|iPhone|iPad/.test(p);
  }

  // Rotating tips for the welcome panel. We pick deterministically from a
  // hash of the day so the same user doesn't see the same tip every panel
  // open — but doesn't see it shuffle on every render either.
  function pickWelcomeTip(){
    // privacy is pinned in the action block (always visible), so don't
    // surface it here too — would feel duplicated on every other day.
    const tips = [
      tMsg('welcome.tip.live'),
      tMsg('welcome.tip.fix'),
      tMsg('welcome.tip.cost'),
      tMsg('welcome.tip.session'),
      tMsg('welcome.tip.languages'),
    ];
    const day = Math.floor(Date.now() / 86_400_000);
    return tips[day % tips.length];
  }

  // ── WELCOME PANEL (idle) ─────────────────────────────────────────
  function buildWelcomePanel(){
    const mac = isMacLike();
    const keyMac = '<kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>R</kbd>';
    const keyWin = '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd>';
    const shortcutLine = mac
      ? tMsg('welcome.runShortcut', { keyMac: keyMac, keyWin: keyWin })
      : tMsg('welcome.runShortcut', { keyMac: keyWin, keyWin: keyMac });

    // Preview block: branches + diff + estimate, mirror of the run card chips
    // but rendered more prominently because this IS the panel's main pitch.
    const hasBranches = !!(state.selectedBase && state.selectedHead);
    const sameBranch = hasBranches && state.selectedBase === state.selectedHead;
    const branchesOk = hasBranches && !sameBranch;
    const previewLines = [];
    if (branchesOk){
      previewLines.push(
        '<div class="welcome-preview__row welcome-preview__row--branches">' +
          '<span class="welcome-preview__icon" aria-hidden="true">⎇</span>' +
          '<span class="welcome-preview__val">' +
            esc(tMsg('welcome.previewBranches', { head: state.selectedHead, base: state.selectedBase })) +
          '</span>' +
        '</div>'
      );
      // Diff stats: the host bundles filesChanged/linesAdded/linesRemoved
      // into the estimate response (there is no separate diffStat endpoint
      // from the client). So we read them off state.estimate when present,
      // and fall back to state.abResult only if a future host wires raw
      // diff stats there. Loading state mirrors estimateLoading so the
      // spinner clears the moment the estimate roundtrip resolves —
      // previously we keyed on abReqId, which is set by aheadBehind (a
      // separate request that never carries filesChanged), leaving the
      // spinner stuck forever.
      const estObj = state.estimate;
      const ab = state.abResult;
      const diffFiles = (estObj && typeof estObj.filesChanged === 'number')
        ? estObj.filesChanged
        : (ab && typeof ab.filesChanged === 'number' ? ab.filesChanged : null);
      const diffAdds = (estObj && typeof estObj.linesAdded === 'number')
        ? estObj.linesAdded
        : (ab && typeof ab.additions === 'number' ? ab.additions : 0);
      const diffDels = (estObj && typeof estObj.linesRemoved === 'number')
        ? estObj.linesRemoved
        : (ab && typeof ab.deletions === 'number' ? ab.deletions : 0);
      if (diffFiles != null){
        previewLines.push(
          '<div class="welcome-preview__row">' +
            '<span class="welcome-preview__icon" aria-hidden="true">≡</span>' +
            '<span class="welcome-preview__val">' +
              esc(tMsg('welcome.previewDiff', {
                files: diffFiles,
                adds: diffAdds,
                dels: diffDels,
              })) +
            '</span>' +
          '</div>'
        );
      } else if (state.estimateLoading){
        previewLines.push(
          '<div class="welcome-preview__row welcome-preview__row--muted welcome-preview__row--loading">' +
            '<span class="welcome-preview__icon welcome-preview__icon--spin" aria-hidden="true">' +
              '<span class="welcome-preview__spinner"></span>' +
            '</span>' +
            '<span class="welcome-preview__val welcome-preview__val--shimmer">'+esc(tMsg('welcome.previewDiffLoading'))+'</span>' +
          '</div>'
        );
      }
      // Estimate row mirrors the cost pill but in token terms. Only render
      // when we have one — no point in a placeholder if estimate is null.
      const est = estimatedTokens();
      if (est != null){
        // Depth label: only fast/deep have a canonical preset chip; for
        // balanced/obsessive we just show the raw depth name.
        const depthLabel = state.depth === 'fast'
          ? tMsg('panel.presetFast')
          : state.depth === 'deep'
          ? tMsg('panel.presetDeep')
          : state.depth;
        const presetLabel = tMsg('welcome.previewPreset', { label: depthLabel });
        previewLines.push(
          '<div class="welcome-preview__row">' +
            '<span class="welcome-preview__icon" aria-hidden="true">◴</span>' +
            '<span class="welcome-preview__val">' +
              esc(tMsg('welcome.previewEstimate', {
                tokens: fmtTokenCount(est),
                presetLabel: presetLabel,
              })) +
            '</span>' +
          '</div>'
        );
      } else if (state.estimateLoading){
        previewLines.push(
          '<div class="welcome-preview__row welcome-preview__row--muted welcome-preview__row--loading">' +
            '<span class="welcome-preview__icon welcome-preview__icon--spin" aria-hidden="true">' +
              '<span class="welcome-preview__spinner"></span>' +
            '</span>' +
            '<span class="welcome-preview__val welcome-preview__val--shimmer">'+esc(tMsg('welcome.previewEstimateLoading'))+'</span>' +
          '</div>'
        );
      }
    } else {
      // No branches yet → friendly nudge instead of a blank preview block.
      previewLines.push(
        '<div class="welcome-preview__row welcome-preview__row--muted welcome-preview__row--hint">' +
          '<span class="welcome-preview__icon" aria-hidden="true">←</span>' +
          '<span class="welcome-preview__val">'+esc(tMsg('welcome.pickBranches'))+'</span>' +
        '</div>'
      );
    }

    // 4 phase cards. Walk PHASE_ORDER so the labels match the live progress
    // chips users will see once they start the run.
    const phaseCards = PHASE_ORDER.map(function(p, idx){
      return '<li class="welcome-phase" data-phase="'+escAttr(p)+'">' +
        '<span class="welcome-phase__num" aria-hidden="true">'+(idx+1)+'</span>' +
        '<span class="welcome-phase__title">'+esc(tMsg('phase.'+p))+'</span>' +
        '<span class="welcome-phase__hint">'+esc(tMsg('phase.'+p+'.hint'))+'</span>' +
      '</li>';
    }).join('');

    // The CTA acts as a proxy click on #btn-start. When branchesOk is false
    // we keep the same proxy behavior (#btn-start is also disabled, so it's
    // a no-op visually) but mute the visual so the user is invited to pick
    // branches on the left instead of clicking a dead button here.
    const ctaState = branchesOk ? 'ready' : 'blocked';

    return ''
      + '<div class="welcome">'
      +   '<header class="welcome__head">'
      +     '<span class="welcome__eyebrow"><span class="welcome__dot" aria-hidden="true"></span>'+esc(tMsg('welcome.eyebrow'))+'</span>'
      +     '<h2 class="welcome__title">'+esc(tMsg('welcome.readyTitle'))+'</h2>'
      +     '<p class="welcome__tagline">'+esc(tMsg('welcome.tagline'))+'</p>'
      +   '</header>'
      +   '<section class="welcome-preview" aria-label="'+escAttr(tMsg('welcome.readyTitle'))+'">'
      +     previewLines.join('')
      +   '</section>'
      +   '<section class="welcome-phases" aria-labelledby="welcome-phases-title">'
      +     '<h3 class="welcome-phases__title" id="welcome-phases-title">'+esc(tMsg('welcome.phasesTitle'))+'</h3>'
      +     '<ol class="welcome-phases__list">'+phaseCards+'</ol>'
      +   '</section>'
      +   '<div class="welcome-action" data-state="'+ctaState+'">'
      +     '<button type="button" class="welcome-cta__btn" id="welcome-run">'
      +       '<span class="welcome-cta__icon" aria-hidden="true">▶</span>'
      +       '<span class="welcome-cta__label">'+esc(tMsg('welcome.runCta'))+'</span>'
      +     '</button>'
      +     '<p class="welcome-action__shortcut">'+shortcutLine+'</p>'
      +     '<div class="welcome-action__divider" aria-hidden="true"></div>'
      +     '<p class="welcome-action__note">'
      +       '<span class="welcome-action__note-icon" aria-hidden="true">🔒</span>'
      +       '<span>'+esc(tMsg('welcome.tip.privacy'))+'</span>'
      +     '</p>'
      +   '</div>'
      +   '<aside class="welcome-tip" role="note">'
      +     '<span class="welcome-tip__icon" aria-hidden="true">💡</span>'
      +     '<span class="welcome-tip__text">'+esc(pickWelcomeTip())+'</span>'
      +   '</aside>'
      + '</div>';
  }

  // ── IN-PROGRESS (no findings yet) ────────────────────────────────
  function buildInProgressPanel(){
    const tokens = tokensSpentSoFar();
    const tokensLine = tokens > 0
      ? tMsg('progress.tokensSpent', { tokens: fmtTokenCount(tokens) })
      : tMsg('progress.tokensSpentNone');
    const est = estimatedTokens();
    const tokensEstLine = est != null && tokens > 0
      ? tMsg('progress.tokensEstimated', { tokens: fmtTokenCount(est) })
      : '';

    const files = (state.changeMap && state.changeMap.length) || 0;
    const filesLine = files === 0
      ? tMsg('progress.filesReviewedNone')
      : files === 1
      ? tMsg('progress.filesReviewedOne')
      : tMsg('progress.filesReviewed', { count: files });

    // Render up to 8 file chips; collapse the rest behind a "+N more" toggle.
    // The toggle is purely cosmetic (in-progress, no decisions to make) so
    // we skip ARIA hand-wringing and rely on the visible chevron.
    const MAX = 8;
    const shown = (state.changeMap || []).slice(0, MAX);
    const overflow = Math.max(0, files - MAX);
    // tMsg returns the key on miss, so for kinds/blasts we don't have a
    // translation for we'd render "changemap.kind.foo". Use the raw value
    // as the fallback display when that happens.
    function labelOr(key, fallback){
      const v = tMsg(key);
      return v === key ? fallback : v;
    }
    const fileChips = shown.map(function(e){
      const blast = e.blastRadius || '';
      const kind = e.kind || '';
      return '<li class="progress-file" data-blast="'+escAttr(blast)+'">' +
        '<span class="progress-file__path">'+esc(e.file)+'</span>' +
        (kind ? '<span class="progress-file__kind">'+esc(labelOr('changemap.kind.'+kind, kind))+'</span>' : '') +
        (blast ? '<span class="progress-file__blast" data-blast="'+escAttr(blast)+'">'+esc(labelOr('changemap.blast.'+blast, blast))+'</span>' : '') +
      '</li>';
    }).join('');
    const overflowChip = overflow > 0
      ? '<li class="progress-file progress-file--more">'+
          '<span class="progress-file__more">'+esc(tMsg('progress.filesShowMore', { count: overflow }))+'</span>'+
        '</li>'
      : '';

    const elapsed = state.runStartedAt ? fmtElapsed(Date.now() - state.runStartedAt) : '0s';

    // Three skeleton cards — give the eye an anchor for "this is where
    // findings will appear". Pulse animation is CSS-only.
    const skeletonCount = 3;
    let skeletons = '';
    for (let i = 0; i < skeletonCount; i++){
      skeletons += '<div class="progress-skel" style="--skel-i:'+i+'">' +
        '<div class="progress-skel__row progress-skel__row--head"></div>' +
        '<div class="progress-skel__row progress-skel__row--body"></div>' +
        '<div class="progress-skel__row progress-skel__row--body progress-skel__row--short"></div>' +
      '</div>';
    }

    return ''
      + '<div class="progress">'
      +   '<header class="progress__head">'
      +     '<span class="progress__pulse" aria-hidden="true"></span>'
      +     '<div class="progress__head-body">'
      +       '<h2 class="progress__title">'+esc(tMsg('progress.title'))+'</h2>'
      +       '<p class="progress__subtitle">'+esc(tMsg('progress.subtitle'))+'</p>'
      +     '</div>'
      +     '<span class="progress__elapsed" id="progress-elapsed" aria-live="polite">'+esc(elapsed)+'</span>'
      +   '</header>'
      +   '<div class="progress-stats">'
      +     '<div class="progress-stat">'
      +       '<span class="progress-stat__icon" aria-hidden="true">⛁</span>'
      +       '<span class="progress-stat__lead" id="progress-tokens-line">'+esc(tokensLine)+'</span>'
      +       (tokensEstLine ? '<span class="progress-stat__sub">'+esc(tokensEstLine)+'</span>' : '')
      +     '</div>'
      +     '<div class="progress-stat">'
      +       '<span class="progress-stat__icon" aria-hidden="true">⊟</span>'
      +       '<span class="progress-stat__lead" id="progress-files-line">'+esc(filesLine)+'</span>'
      +     '</div>'
      +   '</div>'
      +   (files > 0
        ? '<ul class="progress-files">'+fileChips+overflowChip+'</ul>'
        : '')
      +   '<div class="progress-wait">'
      +     '<span class="progress-wait__icon" aria-hidden="true">⏳</span>'
      +     '<span class="progress-wait__text">'+esc(tMsg('progress.waitingFindings'))+'</span>'
      +   '</div>'
      +   '<div class="progress-skels" aria-hidden="true">'+skeletons+'</div>'
      +   '<aside class="welcome-tip welcome-tip--progress" role="note">'
      +     '<span class="welcome-tip__icon" aria-hidden="true">💡</span>'
      +     '<span class="welcome-tip__text">'+esc(pickWelcomeTip())+'</span>'
      +   '</aside>'
      + '</div>';
  }

  // ── MESSAGE (no-match / clean-review fallback) ───────────────────
  function buildMessagePanel(text){
    return ''
      + '<div class="state-msg">'
      +   '<p>'+esc(text)+'</p>'
      + '</div>';
  }

  // ── STICKY HEADER (in-progress with findings) ────────────────────
  function renderInProgressHeader(){
    let host = $('#progress-sticky');
    if (!state.isRunning || visibleFindingsCount() === 0){
      if (host) host.remove();
      return;
    }
    if (!host){
      const right = document.querySelector('.right');
      if (!right) return;
      host = document.createElement('div');
      host.id = 'progress-sticky';
      host.className = 'progress-sticky';
      // Insert right before the filters wrap so it sits above filters &
      // below the summary (which is hidden during running anyway).
      const filters = $('#filters-wrap');
      if (filters && filters.parentNode === right){
        right.insertBefore(host, filters);
      } else {
        right.prepend(host);
      }
    }
    const elapsed = state.runStartedAt ? fmtElapsed(Date.now() - state.runStartedAt) : '0s';
    const tokens = tokensSpentSoFar();
    const files = (state.changeMap && state.changeMap.length) || 0;
    // icon is raw HTML (an SVG string), val/unit are user-displayable
    // text and get escaped. Keeps SVG paths intact while still preventing
    // XSS on numeric/string values.
    function chip(icon, val, unit){
      return '<span class="progress-sticky__chip">' +
        '<span class="progress-sticky__chip-icon" aria-hidden="true">'+icon+'</span>' +
        '<span class="progress-sticky__chip-val">'+esc(String(val))+'</span>' +
        (unit ? '<span class="progress-sticky__chip-unit">'+esc(unit)+'</span>' : '') +
      '</span>';
    }
    // SVG icons (clock, layers, file) render consistently across themes —
    // emoji and box-drawing chars look fine on some themes but tiny or
    // misaligned on others.
    const ICON_CLOCK = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.4a5.6 5.6 0 1 1 0 11.2A5.6 5.6 0 0 1 8 2.4zm-.7 1.6v4.3l3.5 2.1.7-1.15-3-1.8V4z"/></svg>';
    const ICON_STACK = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M8 1L1 4.5 8 8l7-3.5L8 1zM1 8l7 3.5L15 8l-1.4-.7L8 10 2.4 7.3 1 8zm0 3.5L8 15l7-3.5-1.4-.7L8 13.5 2.4 10.8 1 11.5z"/></svg>';
    const ICON_FILE  = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4l3.5 3.5v11A1.5 1.5 0 0 1 11.5 16h-6A1.5 1.5 0 0 1 4 14.5v-13zM5.5 1a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V4H9.5A1.5 1.5 0 0 1 8 2.5V1H5.5zM9 1.5V2.5a.5.5 0 0 0 .5.5h1.79L9 1.21V1.5z"/></svg>';

    host.innerHTML = ''
      + '<span class="progress-sticky__pulse" aria-hidden="true"></span>'
      + '<span class="progress-sticky__label">'+esc(tMsg('progress.stickyRunning'))+'</span>'
      + '<span class="progress-sticky__chips">'
      +   chip(ICON_CLOCK, elapsed, '')
      +   (tokens > 0 ? chip(ICON_STACK, fmtTokenCount(tokens), 'tokens') : '')
      +   (files > 0 ? chip(ICON_FILE, String(files), files === 1 ? 'file' : 'files') : '')
      + '</span>'
      + '<button type="button" class="progress-sticky__stop" id="progress-sticky-stop" title="'+escAttr(tMsg('branch.cancelInProgress'))+'">'+esc(tMsg('progress.stickyStop'))+'</button>';
    const stopBtn = $('#progress-sticky-stop');
    if (stopBtn){
      stopBtn.addEventListener('click', function(){
        // Proxy to the existing Start/Stop button so cancellation goes
        // through the same watchdog + state-reset path as the left pane.
        const start = $('#btn-start');
        if (start) start.click();
      });
    }
  }

  // Incremental update of the in-progress panel — only touches the live
  // numbers (elapsed, tokens, files) without re-rendering the skeleton/tip
  // structure. The full panel rebuild has to wait for a state change that
  // genuinely needs it (changeMap entries, switching out of in-progress).
  // Without this, the 1-second tick would destroy + recreate the DOM
  // every second, resetting the shimmer animation.
  function updateInProgressLiveBits(){
    const elapsedEl = $('#progress-elapsed');
    if (elapsedEl && state.runStartedAt){
      elapsedEl.textContent = fmtElapsed(Date.now() - state.runStartedAt);
    }
    const tokensEl = $('#progress-tokens-line');
    if (tokensEl){
      const tokens = tokensSpentSoFar();
      tokensEl.textContent = tokens > 0
        ? tMsg('progress.tokensSpent', { tokens: fmtTokenCount(tokens) })
        : tMsg('progress.tokensSpentNone');
    }
    const filesEl = $('#progress-files-line');
    if (filesEl){
      const files = (state.changeMap && state.changeMap.length) || 0;
      filesEl.textContent = files === 0
        ? tMsg('progress.filesReviewedNone')
        : files === 1
        ? tMsg('progress.filesReviewedOne')
        : tMsg('progress.filesReviewed', { count: files });
    }
  }

  // ── MAIN ENTRY ───────────────────────────────────────────────────
  /**
   * mode hint: pass 'tick' to skip rebuilds when only the live numbers
   * changed (the 1s setInterval uses this). Defaults to a full re-render,
   * which is what every state-changing event needs.
   */
  function renderRightPaneState(mode){
    const host = $('#right-state');
    if (!host) return;

    const visibleCount = visibleFindingsCount();
    const hasResult = !!state.result;
    const running = !!state.isRunning;

    // When findings exist, the surface is invisible — the cards own the
    // pane. Sticky in-progress header takes over the live signals.
    if (visibleCount > 0){
      host.hidden = true;
      if (host.innerHTML) host.innerHTML = '';
      renderInProgressHeader();
      return;
    }

    // No findings to show. Pick the right mode.
    if (running){
      // Fast path: the panel is already in progress mode and the caller
      // only asked for a live-bits tick. Update text contents in place so
      // the skeleton/pulse animations stay alive.
      if (mode === 'tick' && host.classList.contains('right-state--progress')){
        updateInProgressLiveBits();
        renderInProgressHeader();
        return;
      }
      host.hidden = false;
      host.className = 'right-state right-state--progress';
      host.innerHTML = buildInProgressPanel();
      renderInProgressHeader();
      return;
    }

    if (hasResult){
      // Review done but visibleCount === 0 → either truly clean or a filter
      // mismatch. The active filter tells us which.
      const hasAny = state.findings.some(function(f){
        return !f.dismissed && f.decision !== 'drop' && f.decision !== 'merge';
      });
      host.hidden = false;
      host.className = 'right-state right-state--message';
      host.innerHTML = buildMessagePanel(hasAny ? tMsg('panel.noMatch') : tMsg('panel.cleanReview'));
      renderInProgressHeader();
      return;
    }

    // Pure idle — welcome panel.
    host.hidden = false;
    host.className = 'right-state right-state--welcome';
    host.innerHTML = buildWelcomePanel();
    renderInProgressHeader();
    const cta = $('#welcome-run');
    if (cta){
      cta.addEventListener('click', function(){
        const start = $('#btn-start');
        if (start) start.click();
      });
    }
  }
`;
