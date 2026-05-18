/**
 * Collapse / expand the left pane and the drag-resize gutter that lets the
 * user dial in the split width.
 *
 * applyCollapsed / setLeftCollapsed — toggle the left rail visibility and
 *   persist the choice.
 * applyLeftWidth / setLeftWidth — update the CSS variable that drives the
 *   pane width.
 * setupGutter IIFE — wires the gutter's mousedown drag + double-click reset
 *   + arrow-key resize. Runs immediately so listeners are bound at panel
 *   init time.
 */
export const COLLAPSE = `
  function applyCollapsed(){
    const main = $('#main');
    if (state.leftCollapsed){
      main.setAttribute('data-collapsed', '1');
      $('#left-rail').setAttribute('aria-hidden', 'false');
    } else {
      main.removeAttribute('data-collapsed');
      $('#left-rail').setAttribute('aria-hidden', 'true');
    }
    // Chevron picks the right glyph for the current axis. In stacked the
    // panel collapses downward (so the slider moves UP toward the header
    // when collapsed), so the glyph rotates 90° — handled via CSS using
    // a data-axis attribute on the button.
    const stacked = window.matchMedia('(max-width: 760px)').matches;
    const icon = stacked
      ? (state.leftCollapsed ? '▾' : '▴')
      : (state.leftCollapsed ? '›' : '‹');
    $('#collapse-icon').textContent = icon;
    const btn = $('#btn-collapse');
    btn.setAttribute('aria-label', state.leftCollapsed ? 'Expand panel' : 'Collapse panel');
    btn.title = state.leftCollapsed ? 'Expand panel (⌘\\\\)' : 'Collapse panel (⌘\\\\)';
    if (state.leftCollapsed) renderRail();
  }
  function setLeftCollapsed(v){
    state.leftCollapsed = !!v;
    applyCollapsed();
    persist();
  }

  function applyLeftWidth(){
    document.documentElement.style.setProperty('--left-w', state.leftWidth + 'px');
    const gutter = $('#gutter');
    if (gutter) gutter.setAttribute('aria-valuenow', String(state.leftWidth));
  }
  function setLeftWidth(px){
    state.leftWidth = clampLeftWidth(px);
    applyLeftWidth();
  }

  /** Clamp the user-dragged left height (stacked layout only). Bounds keep
   *  the section big enough to show at least the branch picker (~140px) and
   *  small enough to leave room for findings below it (max ~70% of viewport). */
  function clampLeftHeight(n){
    const x = Number(n);
    if (!isFinite(x)) return 0;
    const max = Math.max(200, Math.round(window.innerHeight * 0.7));
    return Math.min(max, Math.max(140, Math.round(x)));
  }
  function applyLeftHeight(){
    if (!state.leftHeight){
      document.documentElement.style.setProperty('--left-h', 'auto');
    } else {
      document.documentElement.style.setProperty('--left-h', state.leftHeight + 'px');
    }
    // Keep the gutter's a11y orientation in sync with the current layout so
    // screen readers announce arrow-key behavior correctly (LR vs UD).
    const gutter = $('#gutter');
    if (gutter){
      gutter.setAttribute('aria-orientation', isStacked() ? 'horizontal' : 'vertical');
    }
  }
  function setLeftHeight(px){
    state.leftHeight = clampLeftHeight(px);
    applyLeftHeight();
  }

  /** True when the layout is stacked (single column). Use a media query
   *  rather than checking window.innerWidth so the breakpoint stays in sync
   *  with the CSS rule (760px). */
  function isStacked(){
    return window.matchMedia('(max-width: 760px)').matches;
  }

  // Drag-resize the gutter. On desktop it resizes the left WIDTH; in stacked
  // layout the same handle resizes the left HEIGHT — same element, same
  // listeners, axis switched per matchMedia.
  (function setupGutter(){
    const gutter = $('#gutter');
    const main = $('#main');
    if (!gutter || !main) return;
    let dragging = false;
    let stacked = false;
    let startX = 0, startY = 0;
    let startW = state.leftWidth;
    let startH = 0;
    function onMove(ev){
      if (!dragging) return;
      if (stacked){
        const dy = ev.clientY - startY;
        setLeftHeight(startH + dy);
      } else {
        const dx = ev.clientX - startX;
        setLeftWidth(startW + dx);
      }
    }
    function onUp(){
      if (!dragging) return;
      dragging = false;
      gutter.removeAttribute('data-active');
      main.removeAttribute('data-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      persist();
    }
    gutter.addEventListener('mousedown', (ev) => {
      if (state.leftCollapsed) return; // ignore while collapsed
      ev.preventDefault();
      dragging = true;
      stacked = isStacked();
      startX = ev.clientX;
      startY = ev.clientY;
      startW = state.leftWidth;
      // First-time stacked drag: leftHeight is 0/undefined (auto). Seed from
      // the live measurement so the user's drag delta is relative to where
      // the handle currently is, not from 0.
      const leftEl = $('#main .left');
      startH = state.leftHeight || (leftEl ? leftEl.getBoundingClientRect().height : 300);
      gutter.setAttribute('data-active', '1');
      main.setAttribute('data-resizing', '1');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    gutter.addEventListener('dblclick', () => {
      if (state.leftCollapsed) return;
      if (isStacked()){
        // Reset to auto-height (let content drive the size again).
        state.leftHeight = 0;
        applyLeftHeight();
      } else {
        setLeftWidth(420);
      }
      persist();
    });
    gutter.addEventListener('keydown', (ev) => {
      if (state.leftCollapsed) return;
      const step = ev.shiftKey ? 32 : 8;
      if (isStacked()){
        const cur = state.leftHeight || 300;
        if (ev.key === 'ArrowUp'){ setLeftHeight(cur - step); persist(); ev.preventDefault() }
        else if (ev.key === 'ArrowDown'){ setLeftHeight(cur + step); persist(); ev.preventDefault() }
      } else {
        if (ev.key === 'ArrowLeft'){ setLeftWidth(state.leftWidth - step); persist(); ev.preventDefault() }
        else if (ev.key === 'ArrowRight'){ setLeftWidth(state.leftWidth + step); persist(); ev.preventDefault() }
        else if (ev.key === 'Home'){ setLeftWidth(280); persist(); ev.preventDefault() }
        else if (ev.key === 'End'){ setLeftWidth(720); persist(); ev.preventDefault() }
      }
    });
    // Re-sync aria-orientation + collapse chevron when the layout flips
    // between desktop and stacked (window resize, dev-tools open, vscode
    // side panel resize). The chevron glyph depends on axis (›/‹ for
    // horizontal collapse, ▾/▴ for vertical), so we must re-render it.
    window.addEventListener('resize', () => {
      gutter.setAttribute('aria-orientation', isStacked() ? 'horizontal' : 'vertical');
      applyCollapsed();
    });
  })();
`;
