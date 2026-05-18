/**
 * Branch picker — left-pane UI for choosing the base + head branches the
 * review will compare. Includes the search box, local/remote filters, the
 * two scrollable lists, and the ahead/behind pill.
 *
 * Side-effect: on every branch selection it kicks off an aheadBehind host
 * request (for the pill). The response comes back through the message router
 * and is deduped by reqId.
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
    let selectedEl = null;
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
      if (isSel) selectedEl = el;
    }
    // Only auto-scroll when the selection is offscreen — avoids snapping the
    // list back to the top when the user has scrolled elsewhere just to read
    // around. scrollIntoView with block:'nearest' is a no-op when visible.
    if (selectedEl) scrollSelectedIntoView(rootEl, selectedEl);
  }

  /**
   * Scroll the list to bring the selected branch into view IF it's offscreen.
   * Uses manual scrollTop math instead of element.scrollIntoView() because
   * scrollIntoView can scroll ancestor containers too (the whole left pane in
   * this case) — we want to confine the scroll to the branch list only.
   */
  function scrollSelectedIntoView(rootEl, el){
    const rTop = rootEl.scrollTop;
    const rBot = rTop + rootEl.clientHeight;
    const eTop = el.offsetTop;
    const eBot = eTop + el.offsetHeight;
    if (eTop < rTop){
      rootEl.scrollTop = Math.max(0, eTop - 8);
    } else if (eBot > rBot){
      rootEl.scrollTop = eBot - rootEl.clientHeight + 8;
    }
  }

  /**
   * "Locate" affordance — clears the search filter (so the selected branches
   * aren't filtered out) and centers each list on its selection. Useful when
   * the list has scrolled away after a long session.
   */
  function locateSelectedBranches(){
    if (state.branchSearch){
      state.branchSearch = '';
      const input = $('#branch-filter');
      if (input) input.value = '';
    }
    renderBranchPicker();
    const baseList = $('#base-list');
    const headList = $('#head-list');
    if (baseList && state.selectedBase){
      const sel = baseList.querySelector('.branch[aria-selected="true"]');
      if (sel) scrollSelectedIntoView(baseList, sel);
    }
    if (headList && state.selectedHead){
      const sel = headList.querySelector('.branch[aria-selected="true"]');
      if (sel) scrollSelectedIntoView(headList, sel);
    }
  }
  function pickBranch(role, name){
    if (role==='base') state.selectedBase = name; else state.selectedHead = name;
    renderBranchPicker();
    // Kick off both requests FIRST so estimateLoading=true before we render
    // the welcome preview — that's what surfaces the "Calculating diff…"
    // spinner on the first paint. If we rendered before requesting, the
    // welcome would briefly show no diff row at all, then flicker into
    // the spinner once the estimate request set the flag.
    requestAheadBehind();
    requestEstimate();
    renderRightPaneState();
  }
  function requestAheadBehind(){
    if (!state.selectedBase || !state.selectedHead){ state.abResult = null; renderAB(); return; }
    if (state.selectedBase === state.selectedHead){ state.abResult = null; renderAB(); return; }
    const reqId = String(Math.random());
    state.abReqId = reqId;
    vscode.postMessage({type:'aheadBehind', base: state.selectedBase, head: state.selectedHead, reqId});
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
    requestEstimate();
  }
`;
