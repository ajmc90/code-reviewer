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
    $('#collapse-icon').textContent = state.leftCollapsed ? '›' : '‹';
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

  // Drag-resize the gutter
  (function setupGutter(){
    const gutter = $('#gutter');
    const main = $('#main');
    if (!gutter || !main) return;
    let dragging = false;
    let startX = 0;
    let startW = state.leftWidth;
    function onMove(ev){
      if (!dragging) return;
      const dx = ev.clientX - startX;
      setLeftWidth(startW + dx);
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
      startX = ev.clientX;
      startW = state.leftWidth;
      gutter.setAttribute('data-active', '1');
      main.setAttribute('data-resizing', '1');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    gutter.addEventListener('dblclick', () => {
      if (state.leftCollapsed) return;
      setLeftWidth(420);
      persist();
    });
    gutter.addEventListener('keydown', (ev) => {
      if (state.leftCollapsed) return;
      const step = ev.shiftKey ? 32 : 8;
      if (ev.key === 'ArrowLeft'){ setLeftWidth(state.leftWidth - step); persist(); ev.preventDefault() }
      else if (ev.key === 'ArrowRight'){ setLeftWidth(state.leftWidth + step); persist(); ev.preventDefault() }
      else if (ev.key === 'Home'){ setLeftWidth(280); persist(); ev.preventDefault() }
      else if (ev.key === 'End'){ setLeftWidth(720); persist(); ev.preventDefault() }
    });
  })();
`;
