/**
 * Branch picker — left-pane UI for choosing the base + head branches the
 * review will compare. Includes the search box, local/remote filters, the
 * two scrollable lists, and the ahead/behind pill.
 *
 * Side-effect: on every branch selection it kicks off two host requests —
 * aheadBehind (for the pill) and diffStat (for the preflight estimate
 * scaling). Both responses come back through the message router and are
 * deduped by reqId.
 */
export const BRANCH_PICKER = `
  function filterBranches(){
    const q = state.branchSearch.toLowerCase().trim();
    return state.branches.filter(b=>{
      if (b.isRemote && !state.showRemote) return false;
      if (!b.isRemote && !state.showLocal) return false;
      if (!q) return true;
      return [b.name,b.lastAuthor,b.lastSubject].some(s=>String(s||'').toLowerCase().includes(q));
    });
  }
  function renderBranchList(rootEl, role){
    rootEl.innerHTML='';
    const list = filterBranches();
    const selected = role==='base' ? state.selectedBase : state.selectedHead;
    if (list.length === 0){
      rootEl.innerHTML = '<div class="branch-empty">'+esc(tMsg('branch.noMatch'))+'</div>';
      return;
    }
    for (const b of list){
      const isSel = selected === b.name;
      const el = document.createElement('div');
      el.className = 'branch';
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', isSel ? 'true' : 'false');
      el.tabIndex = 0;
      el.dataset.name = b.name;
      const badges = [];
      if (b.isCurrent) badges.push('current');
      if (b.isRemote) badges.push(b.remote || 'remote');
      if (!b.isRemote && b.upstream) badges.push('→ '+b.upstream);
      el.innerHTML =
        '<div class="branch-name" title="'+escAttr(b.name)+'">'+ esc(b.name) +'</div>' +
        (badges.length ? '<div class="branch-badges">'+badges.map(x=>'<span class="badge">'+esc(x)+'</span>').join('')+'</div>' : '') +
        '<div class="branch-meta">'+ esc((b.lastSubject||'').slice(0,80)) + (b.lastAuthor?' · '+esc(b.lastAuthor):'') + (b.lastCommitISO?' · '+timeAgo(b.lastCommitISO):'') +'</div>';
      el.addEventListener('click', ()=>{ pickBranch(role, b.name) });
      el.addEventListener('keydown', (ev)=>{
        if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); pickBranch(role, b.name) }
      });
      rootEl.appendChild(el);
    }
  }
  function pickBranch(role, name){
    if (role==='base') state.selectedBase = name; else state.selectedHead = name;
    renderBranchPicker();
    requestAheadBehind();
  }
  function requestAheadBehind(){
    if (!state.selectedBase || !state.selectedHead){ state.abResult = null; renderAB(); return; }
    if (state.selectedBase === state.selectedHead){ state.abResult = null; renderAB(); return; }
    const reqId = String(Math.random());
    state.abReqId = reqId;
    vscode.postMessage({type:'aheadBehind', base: state.selectedBase, head: state.selectedHead, reqId});
    // Also fetch a preflight diff stat so the runtime estimate can scale to
    // the actual size of the change rather than relying on hardcoded ranges.
    const dsReqId = String(Math.random());
    state.diffStatReqId = dsReqId;
    state.diffStat = null;
    vscode.postMessage({type:'diffStat', base: state.selectedBase, head: state.selectedHead, reqId: dsReqId});
  }
  function renderAB(){
    const pill = $('#ab-pill');
    if (!state.selectedBase || !state.selectedHead){ pill.textContent = ''; return; }
    if (state.selectedBase === state.selectedHead){ pill.innerHTML = '<span class="same">'+esc(tMsg('branch.sameBranch'))+'</span>'; return; }
    const r = state.abResult;
    if (!r){ pill.textContent = '…'; return; }
    pill.innerHTML = '<span class="ahead">'+esc(tMsg('branch.ahead', {n: r.ahead}))+'</span> · <span class="behind">'+esc(tMsg('branch.behind', {n: r.behind}))+'</span>';
  }

  function renderBranchPicker(){
    $('#base-current').textContent = state.defaultBase ? tMsg('branch.default', {name: state.defaultBase}) : '';
    $('#head-current').textContent = state.currentBranch ? tMsg('branch.current', {name: state.currentBranch}) : '';
    $('#branches-meta').textContent = state.remotes.length
      ? tMsg('branch.countWithRemotes', {count: state.branches.length, remotes: state.remotes.length})
      : tMsg('branch.count', {count: state.branches.length});
    renderBranchList($('#base-list'), 'base');
    renderBranchList($('#head-list'), 'head');
    renderAB();
    renderRunCard();
    if (state.leftCollapsed) renderRail();
  }
  function applyBranches(payload){
    state.branches = payload.branches || [];
    state.remotes = payload.remotes || [];
    state.defaultBase = payload.defaultBase;
    state.currentBranch = payload.currentBranch;
    if (!state.selectedBase && state.defaultBase){
      const def = state.branches.find(b=>b.name===state.defaultBase) || state.branches.find(b=>b.name==='origin/'+state.defaultBase);
      if (def) state.selectedBase = def.name;
    }
    if (!state.selectedHead && state.currentBranch){
      const cur = state.branches.find(b=>b.name===state.currentBranch);
      if (cur) state.selectedHead = cur.name;
    }
    const errEl = $('#branch-error');
    if (payload.error){
      errEl.textContent = payload.error;
      errEl.removeAttribute('data-empty');
    } else {
      errEl.textContent = '';
      errEl.setAttribute('data-empty', '1');
    }
    renderBranchPicker();
    requestAheadBehind();
  }
`;
