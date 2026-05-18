/**
 * Streaming log shown in the left pane while a review is running.
 * Caps at 600 lines (oldest evicted) to keep DOM size bounded — important
 * because passOutput events fire many times per pass.
 *
 * Reads/writes #live element and #log-count. Owns its own liveLineCount
 * counter (not part of state, only the log cares about it).
 */
export const LIVE_LOG = `
  let liveLineCount = 0;
  function appendLive(level, text, passTag){
    const live = $('#live');
    if (live.classList.contains('empty')){ live.classList.remove('empty'); live.innerHTML='' }
    const cleanText = String(text==null?'':text).replace(/\\s+$/, '');
    if (!cleanText) return;
    const div = document.createElement('div');
    div.className = 'line ' + (level || 'info');
    const passSpan = passTag ? '<span class="pass">['+esc(passTag)+']</span>' : '';
    div.innerHTML = '<span class="ts">'+nowStamp()+'</span>'+passSpan+esc(cleanText);
    live.appendChild(div);
    liveLineCount++;
    while (live.childElementCount > 600) live.removeChild(live.firstChild);
    $('#log-count').textContent = liveLineCount ? '('+liveLineCount+' lines)' : '';
    live.scrollTop = live.scrollHeight;
  }
  function clearLive(){
    const live = $('#live');
    live.classList.add('empty');
    live.innerHTML = esc(tMsg('log.cleared'));
    liveLineCount = 0;
    $('#log-count').textContent = '';
  }
  function applyLogOpen(){
    const pane = $('#log-pane');
    const btn = $('#btn-toggle-log');
    const actions = $('#log-header-actions');
    if (!pane || !btn) return;
    const open = !!state.logOpen;
    pane.hidden = !open;
    if (actions) actions.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', tMsg(open ? 'panel.logHide' : 'panel.logShow'));
    if (open){
      const live = $('#live');
      if (live) live.scrollTop = live.scrollHeight;
    }
  }
`;
