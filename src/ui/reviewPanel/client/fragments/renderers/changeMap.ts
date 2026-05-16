/**
 * "Changes in this branch" section above the findings grid. Renders the
 * per-file classification the explore pass produced (file kind + blast
 * radius). Collapsible; collapsed state persists.
 *
 * Attaches its own click + keyboard listeners to the header inside the
 * render function — re-attached on every render, which is fine because we
 * replace the entire DOM subtree.
 */
export const CHANGE_MAP = `
  function renderChangeMap(){
    const root = $('#changemap');
    if (!root) return;
    const entries = state.changeMap || [];
    if (entries.length === 0){ root.hidden = true; return; }
    root.hidden = false;
    const collapsed = !!state.changeMapCollapsed;
    root.classList.toggle('changemap--collapsed', collapsed);
    const head =
      '<div class="changemap__head" id="changemap-head" role="button" tabindex="0" aria-expanded="'+(collapsed?'false':'true')+'">' +
        '<h3 class="changemap__title">'+esc(tMsg('changemap.title'))+'</h3>' +
        '<span class="changemap__count">'+esc(tMsg('changemap.fileCount', {count: entries.length}))+'</span>' +
        '<button type="button" class="changemap__toggle" id="changemap-toggle" aria-label="'+escAttr(collapsed ? tMsg('changemap.expand') : tMsg('changemap.collapse'))+'">'+
          (collapsed ? '▸' : '▾') +
        '</button>' +
      '</div>';
    const chips = entries.map(e => {
      const kindLabel = tMsg('changemap.kind.' + e.kind) || e.kind;
      const blastLabel = tMsg('changemap.blast.' + e.blastRadius) || e.blastRadius;
      const titleAttr = e.note ? esc(e.file) + ' — ' + esc(e.note) : esc(e.file);
      return '<span class="changemap__chip" data-blast="'+escAttr(e.blastRadius)+'" title="'+escAttr(titleAttr)+'">' +
        '<span class="file">'+esc(e.file)+'</span>' +
        '<span class="kind">'+esc(kindLabel)+'</span>' +
        '<span class="blast">'+esc(blastLabel)+'</span>' +
      '</span>';
    }).join('');
    root.innerHTML = head + '<div class="changemap__list">' + chips + '</div>';
    const headEl = $('#changemap-head');
    const toggle = () => { state.changeMapCollapsed = !state.changeMapCollapsed; persist(); renderChangeMap(); };
    if (headEl){
      headEl.addEventListener('click', toggle);
      headEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); toggle(); }
      });
    }
  }
`;
