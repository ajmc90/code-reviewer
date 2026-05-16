import { messages as MESSAGES_DICT } from '../../i18n/messages';
import type { Lang } from '../../i18n';

const CLIENT_TEMPLATE = `
(function(){
  const vscode = acquireVsCodeApi();
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ─── i18n ───────────────────────────────────────────────────
  // The host injects the whole dictionary so the webview can render
  // dynamic content (passes, findings, statuses) in the active language
  // without round-tripping each label.
  const MESSAGES = __MESSAGES_JSON__;
  let LANG = __LANG_JSON__;
  function tMsg(key, params){
    const dict = MESSAGES[LANG] || MESSAGES.en;
    const tmpl = (dict && dict[key]) || (MESSAGES.en && MESSAGES.en[key]) || key;
    if (!params) return tmpl;
    return String(tmpl).replace(/\\{(\\w+)\\}/g, (_, k) => {
      const v = params[k];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  // PASS_DEFS keeps stable keys; labels/hints come from i18n at render time.
  // phase = which of the 5 pipeline phases (A discovery, B specialists,
  // C consolidation [no toggle — runs locally], D completeness, E critique).
  // conditional = pass only fires under specific diff shapes (don't surprise
  // the user with zero findings); costSec is a rough lower/upper Claude-call
  // estimate used to render the runtime hint.
  const PASS_DEFS = [
    { key: 'structural',    phase: 'discovery',     costSec: [25, 50] },
    { key: 'explore',       phase: 'discovery',     costSec: [40, 80] },
    { key: 'security',      phase: 'specialists',   costSec: [35, 70] },
    { key: 'performance',   phase: 'specialists',   costSec: [30, 60] },
    { key: 'accessibility', phase: 'specialists',   costSec: [25, 50], conditional: 'ui-only' },
    { key: 'tests',         phase: 'specialists',   costSec: [30, 60] },
    { key: 'gaps',          phase: 'completeness',  costSec: [35, 70] },
    { key: 'permute',       phase: 'completeness',  costSec: [40, 80] },
    { key: 'critique',      phase: 'critique',      costSec: [40, 80] },
  ];
  // Presets — each lists keys that should be enabled; everything else off.
  // No "all" preset: it was identical to "deep", and the Advanced toggle
  // already lets power users tweak individual passes.
  const PASS_PRESETS = {
    fast:     ['structural', 'explore', 'critique'],
    deep:     PASS_DEFS.map(p => p.key),
    security: ['structural', 'explore', 'security', 'gaps', 'critique'],
  };
  // Display order for the 5-phase pipeline. Consolidation has no toggle (it
  // is local and always runs when there are findings); it appears in the live
  // timeline only.
  const PHASE_ORDER = ['discovery', 'specialists', 'completeness', 'critique'];
  function passLabel(key){ return tMsg('pass.' + key + '.label'); }
  function passHint(key){  return tMsg('pass.' + key + '.hint');  }
  function passDetail(key){ return tMsg('pass.' + key + '.detail'); }
  function phaseLabel(name){ return tMsg('phase.' + name); }
  function phaseHint(name){ return tMsg('phase.' + name + '.hint'); }
  const PASS_KEY_SET = new Set(PASS_DEFS.map(p => p.key));

  /** Sum costSec ranges for active passes → "~Xm" / "~X–Ym". */
  function formatEstimate(){
    let lo = 0, hi = 0, n = 0;
    for (const def of PASS_DEFS){
      if (!state.passes[def.key]) continue;
      n++;
      lo += def.costSec[0];
      hi += def.costSec[1];
    }
    if (n === 0) return '';
    const fmt = (s) => {
      if (s < 60) return s + 's';
      const m = Math.round(s / 60);
      return m + 'm';
    };
    const range = fmt(lo) === fmt(hi) ? fmt(lo) : (fmt(lo) + '–' + fmt(hi));
    return tMsg('passes.estimate', { range: range, calls: n });
  }
  /** Currently-matching preset name, or null if no exact match. */
  function activePresetName(){
    const active = new Set();
    for (const def of PASS_DEFS) if (state.passes[def.key]) active.add(def.key);
    for (const [name, keys] of Object.entries(PASS_PRESETS)){
      if (active.size !== keys.length) continue;
      if (keys.every(k => active.has(k))) return name;
    }
    return null;
  }

  const CATEGORY_DEFS = [
    'bug', 'security', 'performance', 'correctness', 'maintainability',
    'readability', 'tests', 'docs', 'style', 'architecture',
    'accessibility', 'concurrency', 'data-integrity', 'api-contract', 'other',
  ];

  const persisted = (vscode.getState && vscode.getState()) || {};
  const defaultPasses = {};
  for (const p of PASS_DEFS) defaultPasses[p.key] = true;

  const state = {
    findings: [], filter: 'all', search: '', categoryFilters: new Set(),
    steps: new Map(),
    result: null,
    branches: [], remotes: [], defaultBase: null, currentBranch: null,
    selectedBase: null, selectedHead: null,
    showLocal: true, showRemote: true, branchSearch: '', fetching: false,
    abReqId: '', abResult: null,
    isRunning: false,
    passes: Object.assign({}, defaultPasses, persisted.passes || {}),
    leftCollapsed: !!persisted.leftCollapsed,
    leftWidth: clampLeftWidth(persisted.leftWidth) || 420,
    runningPass: null,
    // Most recent partial-state summary from the host. null = no paused review.
    partial: null,
    // Per-file classification emitted by the explore pass. Rendered above the
    // findings grid as a collapsible map. [] = not received yet.
    changeMap: [],
    changeMapCollapsed: !!persisted.changeMapCollapsed,
    // Last consolidation event {before, after, merged}. null = no consolidation yet.
    consolidation: null,
    // Map of pass → reason it was auto-skipped (no UI checkbox involvement).
    conditionalSkips: {},
    // When true, the editable per-pass pills are shown. When false, only the
    // preset row + read-only "active passes" chips are visible. Persisted so
    // power users don't have to re-open it every session.
    advancedOpen: !!persisted.advancedOpen,
    // Wall-clock time when the current run started (for the Run card elapsed).
    // null when idle / done.
    runStartedAt: null,
    // Most recent phase the orchestrator entered. Drives the "Phase X/N · label"
    // line on the running Run card.
    currentPhase: null,
  };

  function clampLeftWidth(n){
    const x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.min(720, Math.max(280, Math.round(x)));
  }
  function persist(){
    if (!vscode.setState) return;
    vscode.setState({
      passes: state.passes,
      leftCollapsed: state.leftCollapsed,
      leftWidth: state.leftWidth,
      changeMapCollapsed: state.changeMapCollapsed,
      advancedOpen: state.advancedOpen,
    });
  }

  /**
   * Client-side dedupe mirror of the orchestrator's Phase C consolidation.
   * The panel maintains its own findings[] (built from streamed findingAdded
   * events), so when the orchestrator emits a consolidation event we need to
   * reflect the merge here too.
   *
   * Conservative: only collapses findings that share the same file AND a
   * normalized title prefix AND overlap within 3 lines.
   */
  function dedupeFindingsClient(findings){
    const slack = 3;
    const norm = (s) => String(s||'').toLowerCase().replace(/^related:\s*/i,'').replace(/[^a-z0-9]/g,'').slice(0, 40);
    const isRelated = (f) => /^related:\s*/i.test(f.title||'') || !!f.relatedTo;
    const buckets = [];
    for (const f of findings){
      if (isRelated(f)){ buckets.push([f]); continue; }
      const nt = norm(f.title);
      let placed = false;
      for (const b of buckets){
        const c = b[0];
        if (isRelated(c)) continue;
        if (c.file !== f.file) continue;
        const overlap = (c.range.startLine - slack) <= f.range.endLine && (f.range.startLine - slack) <= c.range.endLine;
        if (!overlap) continue;
        const nc = norm(c.title);
        const sameCat = c.category === f.category && (c.range.startLine === f.range.startLine);
        if (nc === nt || (nt.length >= 12 && nc.includes(nt)) || (nc.length >= 12 && nt.includes(nc)) || sameCat){
          b.push(f); placed = true; break;
        }
      }
      if (!placed) buckets.push([f]);
    }
    const rank = { critical:4, major:3, minor:2, nit:1, praise:0 };
    return buckets.map(b => b.sort((x,y) => (rank[y.severity]||0) - (rank[x.severity]||0))[0]);
  }

  function passLabelLong(pass){
    return tMsg('timeline.' + pass);
  }

  // ─── utilities ──────────────────────────────────────────────
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;') }
  function truncateForMeta(s){
    s = String(s||'').replace(/\s+/g, ' ').trim();
    return s.length > 60 ? s.slice(0,60)+'…' : s;
  }
  function fmtElapsed(ms){
    const s = Math.round(ms/1000);
    if (s < 60) return s+'s';
    const m = Math.floor(s/60), r = s%60;
    return m+'m '+r+'s';
  }
  function timeAgo(iso){
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const s = Math.floor((Date.now()-d.getTime())/1000);
    if (s < 60) return s+'s ago';
    if (s < 3600) return Math.floor(s/60)+'m ago';
    if (s < 86400) return Math.floor(s/3600)+'h ago';
    if (s < 86400*30) return Math.floor(s/86400)+'d ago';
    if (s < 86400*365) return Math.floor(s/(86400*30))+'mo ago';
    return Math.floor(s/(86400*365))+'y ago';
  }
  function pad2(n){ return n < 10 ? '0'+n : ''+n }
  function nowStamp(){
    const d = new Date();
    return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }

  // ─── branch picker ──────────────────────────────────────────
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
  }
  function renderAB(){
    const pill = $('#ab-pill');
    if (!state.selectedBase || !state.selectedHead){ pill.textContent = ''; return; }
    if (state.selectedBase === state.selectedHead){ pill.innerHTML = '<span class="same">'+esc(tMsg('branch.sameBranch'))+'</span>'; return; }
    const r = state.abResult;
    if (!r){ pill.textContent = '…'; return; }
    pill.innerHTML = '<span class="ahead">'+esc(tMsg('branch.ahead', {n: r.ahead}))+'</span> · <span class="behind">'+esc(tMsg('branch.behind', {n: r.behind}))+'</span>';
  }
  // ─── Run card ────────────────────────────────────────────────
  // The card has three visual states reflected via data-state on .run-card:
  //   blocked  → missing branches/passes, button disabled, helpful message
  //   ready    → user can press Start, chips show preview info
  //   running  → button becomes Stop, chips switch to live progress
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

  /** Idle/ready chips: branches · passes · estimated time. */
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

    // Estimated-time chip — reuses formatEstimate() but extracts the range only.
    if (passActive){
      const est = formatEstimateRange();
      if (est){
        const ariaLabel = tMsg('run.chipTimeAria', { range: est });
        chips.push(
          '<span class="run-chip" data-tone="time" title="'+escAttr(ariaLabel)+'" aria-label="'+escAttr(ariaLabel)+'">' +
            '<span class="run-chip__icon" aria-hidden="true">◷</span>' +
            '<span class="run-chip__val">'+esc(tMsg('run.chipTime', { range: est }))+'</span>' +
          '</span>'
        );
      }
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

    // Findings + elapsed chip
    const count = state.findings.length;
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

  /** Returns just the time range string (e.g. "2–3m") used in the time chip. */
  function formatEstimateRange(){
    let lo = 0, hi = 0, n = 0;
    for (const def of PASS_DEFS){
      if (!state.passes[def.key]) continue;
      n++;
      lo += def.costSec[0];
      hi += def.costSec[1];
    }
    if (n === 0) return '';
    const fmt = (s) => {
      if (s < 60) return s + 's';
      return Math.round(s / 60) + 'm';
    };
    return fmt(lo) === fmt(hi) ? fmt(lo) : (fmt(lo) + '–' + fmt(hi));
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

  // ─── timeline ────────────────────────────────────────────────
  // Steps shown here are non-orchestrator-pass entries (context, diff) plus
  // each pass. Status drives the visuals and which action buttons we render:
  //   running        → spinner
  //   done           → check
  //   error          → warning + (if review stopped) inline Retry button
  //   awaitDecision  → warning + Retry/Skip/Stop buttons (orchestrator paused)
  //   skipped        → muted, strike-through + Retry button when review stopped
  function renderTimeline(){
    const root = $('#timeline'); root.innerHTML='';
    if (state.steps.size === 0){
      root.innerHTML = '<div class="timeline-empty">'+esc(tMsg('timeline.empty'))+'</div>';
      return;
    }
    const now = Date.now();
    for (const [pass, info] of state.steps){
      const div = document.createElement('div');
      div.className = 'step ' + info.status;
      if (info.autoSkipped) div.classList.add('step--auto-skipped');
      div.setAttribute('role', 'listitem');
      const icon =
        info.status==='running' ? '◐'
        : info.status==='done' ? '✓'
        : info.status==='error' ? '⚠'
        : info.status==='awaitDecision' ? '⚠'
        : info.status==='skipped' ? '–'
        : '·';
      const label = passLabelLong(pass);
      // Auto-skipped pills get an ⓘ tooltip explaining why; manual-skipped
      // (user clicked skip) keep their existing visuals.
      const skipBadge = info.autoSkipped
        ? '<span class="step-badge step-badge--auto" title="'+escAttr(info.detail || tMsg('conditionalSkip.label'))+'">ⓘ '+esc(tMsg('conditionalSkip.label'))+'</span>'
        : '';
      let elapsed = '';
      if (info.startedAt){
        const end = info.endedAt || now;
        elapsed = fmtElapsed(end - info.startedAt);
      }
      const activity = info.lastActivity
        ? '<div class="activity" title="'+escAttr(info.lastActivity)+'">'+esc(info.lastActivity)+'</div>'
        : '';
      const actions = renderStepActions(pass, info);
      div.innerHTML =
        '<div class="ico" aria-hidden="true">'+ icon +'</div>' +
        '<div class="body">' +
          '<div class="label"><span>'+esc(label)+'</span>'+skipBadge+'<span class="elapsed">'+esc(elapsed)+'</span></div>' +
          '<div class="meta">'+esc(info.detail || (info.status==='running' ? tMsg('timeline.working') : ''))+'</div>' +
          activity +
          actions +
        '</div>';
      root.appendChild(div);
    }
    // Append a synthetic "Consolidation" step after specialists if we received
    // one. It is not a real pass (no CLI call) so we render it as a stand-alone
    // info pill at the bottom of whatever pass list exists.
    if (state.consolidation){
      const c = state.consolidation;
      const div = document.createElement('div');
      div.className = 'step done step--consolidation';
      div.setAttribute('role', 'listitem');
      const tip = tMsg('consolidation.tooltip', { merged: c.merged, before: c.before, after: c.after });
      div.innerHTML =
        '<div class="ico" aria-hidden="true">⇲</div>' +
        '<div class="body">' +
          '<div class="label"><span>'+esc(tMsg('timeline.consolidation'))+'</span>' +
            '<span class="step-badge step-badge--merged" title="'+escAttr(tip)+'">ⓘ '+esc(tMsg('consolidation.badge', { merged: c.merged }))+'</span>' +
          '</div>' +
          '<div class="meta">'+esc(c.before+' → '+c.after)+'</div>' +
        '</div>';
      root.appendChild(div);
    }
    if (state.leftCollapsed) renderRail();
  }

  // Real pass names that can be retried/skipped/stopped. 'context' and 'diff'
  // are bootstrap stages, not Claude passes — they don't get action buttons.
  const ACTIONABLE_PASSES = new Set(['structural','explore','security','performance','accessibility','tests','gaps','permute','critique']);

  function renderResumeBanner(){
    const el = $('#resume-banner');
    if (!el) return;
    if (!state.partial || state.isRunning){
      el.removeAttribute('data-visible');
      return;
    }
    const p = state.partial;
    const remaining = totalPassCount() - p.completedPasses.length - p.skippedPasses.length;
    $('#resume-banner-title').textContent = tMsg('resume.title', {head: p.headBranch, base: p.baseBranch});
    const reason = p.pausedReason ? p.pausedReason : tMsg('resume.reasonDefault');
    const summary = tMsg('resume.summary', {
      completed: p.completedPasses.length,
      skipped: p.skippedPasses.length,
      pending: Math.max(0, remaining),
      findings: p.findingCount,
    });
    $('#resume-banner-detail').textContent = summary + ' — ' + reason;
    el.setAttribute('data-visible', '1');
  }

  function totalPassCount(){
    // Count active passes per the current opts.passes selection. We treat
    // anything the user toggled on as a "planned" pass for the % math.
    let n = 0;
    for (const k of Object.keys(state.passes)) if (state.passes[k]) n++;
    return n;
  }

  function renderStepActions(pass, info){
    if (!ACTIONABLE_PASSES.has(pass)) return '';
    if (info.status === 'awaitDecision'){
      // Orchestrator is parked waiting for our verdict.
      return ''
        + '<div class="actions" role="group">'
        +   '<button class="primary" type="button" data-decision="retry" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.retry'))+'</button>'
        +   '<button type="button" data-decision="skip" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.skip'))+'</button>'
        +   '<button class="danger" type="button" data-decision="stop" data-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.stop'))+'</button>'
        + '</div>';
    }
    // After the review halted, offer per-step Retry on anything that didn't
    // finish cleanly. Hidden while another review is running so we don't queue
    // a second job.
    if (!state.isRunning && state.partial && (info.status === 'error' || info.status === 'skipped')){
      return ''
        + '<div class="actions">'
        +   '<button class="primary" type="button" data-retry-pass="'+escAttr(pass)+'">'+esc(tMsg('timeline.retryPass'))+'</button>'
        + '</div>';
    }
    return '';
  }

  // ─── log ─────────────────────────────────────────────────────
  let liveLineCount = 0;
  function appendLive(level, text, passTag){
    const live = $('#live');
    if (live.classList.contains('empty')){ live.classList.remove('empty'); live.innerHTML='' }
    const cleanText = String(text==null?'':text).replace(/\s+$/, '');
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

  // ─── counters ───────────────────────────────────────────────
  function bumpCounter(){
    const counts = {critical:0, major:0, minor:0, nit:0, praise:0, silenced:0};
    for (const f of state.findings) if (counts[f.severity] != null) counts[f.severity]++;
    for (const k of Object.keys(counts)){
      const el = $('#c-'+k);
      if (el){
        el.textContent = counts[k];
        const parent = el.closest('.counter');
        if (parent) parent.setAttribute('data-active', counts[k] > 0 ? '1' : '0');
      }
    }
    if (state.leftCollapsed) renderRail();
  }

  // ─── category filter chips ───────────────────────────────────
  function categoryCounts(){
    const counts = {};
    for (const f of state.findings){
      if (f.dismissed) continue;
      const c = f.category || 'other';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }
  function renderCategoryChips(){
    const root = $('#cat-filters');
    if (!root) return;
    const counts = categoryCounts();
    const total = Object.values(counts).reduce((a,b)=>a+b,0);
    const present = CATEGORY_DEFS.filter(c => counts[c]).sort((a,b) => counts[b] - counts[a]);
    if (total === 0){
      // No findings yet — keep the row visible but empty/quiet
      root.innerHTML = '';
      return;
    }
    const cleanedFilters = new Set(Array.from(state.categoryFilters).filter(c => counts[c]));
    if (cleanedFilters.size !== state.categoryFilters.size){
      state.categoryFilters = cleanedFilters;
    }
    const html = ['<span class="filter-cat-label">Category</span>'];
    html.push('<button class="cat-chip" type="button" data-cat-all="1" aria-pressed="'+(state.categoryFilters.size===0?'true':'false')+'" title="Show all categories">all <span class="count">'+total+'</span></button>');
    for (const c of present){
      const pressed = state.categoryFilters.has(c);
      html.push('<button class="cat-chip" type="button" data-cat="'+escAttr(c)+'" aria-pressed="'+(pressed?'true':'false')+'" title="Toggle '+escAttr(c)+'">'+esc(c)+' <span class="count">'+counts[c]+'</span></button>');
    }
    root.innerHTML = html.join('');
  }

  // ─── change map (per-file classification) ────────────────────
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

  // ─── findings ────────────────────────────────────────────────
  function renderFindings(){
    const root = $('#findings'); root.innerHTML = '';
    const q = state.search.toLowerCase().trim();
    const filtered = state.findings.filter(f=>{
      if (f.dismissed) return false;
      if (state.filter !== 'all' && f.severity !== state.filter) return false;
      if (state.categoryFilters.size && !state.categoryFilters.has(f.category || 'other')) return false;
      if (!q) return true;
      return [f.file,f.title,f.category,f.description].some(s=>String(s||'').toLowerCase().includes(q));
    });
    renderCategoryChips();
    const empty = $('#empty');
    if (filtered.length === 0){
      empty.hidden = false;
      empty.textContent = state.result
        ? (state.findings.length ? tMsg('panel.noMatch') : tMsg('panel.cleanReview'))
        : '';
      if (!state.result){
        empty.innerHTML = tMsg('panel.emptyState');
      }
      return;
    }
    empty.hidden = true;
    for (const f of filtered){
      root.appendChild(buildFindingCard(f));
    }
  }

  // Compute which language a finding's text is currently shown in.
  // Per-row displayLang (set via the in-card chip) wins; otherwise the
  // global LANG. Falls back to originalLang when no translation is cached yet.
  function effectiveFindingLang(f){
    const target = f.displayLang || LANG;
    const orig = f.originalLang || 'en';
    if (target === orig) return orig;
    if (f.translations && f.translations[target]) return target;
    return orig;
  }

  // Return the displayed string for one of a finding's translatable fields.
  function pickField(f, field){
    const target = f.displayLang || LANG;
    const orig = f.originalLang || 'en';
    if (target !== orig && f.translations && f.translations[target]) {
      const tr = f.translations[target];
      const v = tr[field];
      if (v !== undefined && v !== null) return v;
    }
    return f[field];
  }

  function buildFindingCard(f){
    const card = document.createElement('article');
    card.className = 'finding';
    card.dataset.id = f.id;
    card.dataset.severity = f.severity || 'minor';
    card.setAttribute('aria-expanded', 'false');
    const sev = f.severity || 'minor';
    const fix = f.suggestedFix;
    // Use translated field accessors so per-row chip and global toggle both work.
    const title = pickField(f, 'title') || '';
    const description = pickField(f, 'description') || '';
    const reasoning = pickField(f, 'reasoning') || '';
    const questionsRaised = pickField(f, 'questionsRaised') || [];
    const evidence = pickField(f, 'evidence') || [];
    const alternativesConsidered = pickField(f, 'alternativesConsidered') || [];
    // Translated fix fields when available; the code in suggestedFix.replacement
    // and structural fields like range/confidence are not translated.
    const fixTranslated = (() => {
      if (!fix) return null;
      const target = f.displayLang || LANG;
      const orig = f.originalLang || 'en';
      if (target !== orig && f.translations && f.translations[target] && f.translations[target].suggestedFix) {
        return f.translations[target].suggestedFix;
      }
      return { description: fix.description, replacement: fix.replacement };
    })();
    const showingLang = effectiveFindingLang(f);
    const otherLang = showingLang === 'es' ? 'en' : 'es';
    const otherLangLabel = tMsg('lang.' + otherLang);
    const otherLangFull = tMsg(otherLang === 'es' ? 'lang.spanishLong' : 'lang.englishLong');
    const isTranslating = !!f._translating;
    const locLabel = esc(f.file)+':'+f.range.startLine+(f.range.endLine!==f.range.startLine?'-'+f.range.endLine:'');
    // If the finding is "Related:" to a prior one, render a badge that jumps
    // to it. relatedTo is set by the parser when it links a Related: title to
    // an existing finding's id.
    const relatedBadge = f.relatedTo
      ? '<a class="related-badge" href="#" data-related="'+escAttr(f.relatedTo)+'" title="'+escAttr(tMsg('related.tooltip'))+'" aria-label="'+escAttr(tMsg('related.jumpTitle'))+'">'+esc(tMsg('related.badge'))+'</a>'
      : '';
    // Silenced findings get a badge that tells the user this is something
    // they previously dismissed — it came back, but Claude is honoring the
    // earlier decision and demoting it. Hover reveals the mode (this/pattern).
    const silencedBadge = f.severity === 'silenced'
      ? '<span class="silenced-badge" data-mode="'+escAttr(f.silencedMode||'this')+'" title="'+
          escAttr(tMsg(f.silencedMode === 'pattern' ? 'panel.silencedBadgeTooltipPattern' : 'panel.silencedBadgeTooltipThis'))+'">'+
          '<span aria-hidden="true">🔕</span> '+
          esc(tMsg(f.silencedMode === 'pattern' ? 'panel.silencedBadgePattern' : 'panel.silencedBadgeThis'))+
        '</span>'
      : '';
    card.innerHTML =
      '<div class="finding-head" role="button" tabindex="0" data-toggle="'+escAttr(f.id)+'" aria-controls="body-'+escAttr(f.id)+'" aria-label="'+escAttr(sev+': '+title)+'">' +
        '<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>' +
        '<span class="sev" data-sev="'+escAttr(sev)+'">'+esc(sev)+'</span>' +
        '<span class="cat">'+esc(f.category||'other')+'</span>' +
        '<span class="title">'+esc(title)+'</span>' +
        relatedBadge +
        silencedBadge +
        '<span class="loc" role="button" tabindex="0" data-open="'+escAttr(f.id)+'" aria-label="'+escAttr(tMsg('card.jumpTo', {loc: locLabel}))+'">'+locLabel+'</span>' +
        '<span class="conf">'+esc(f.confidence||'')+'</span>' +
        '<button class="lang-chip'+(isTranslating?' is-loading':'')+'" type="button" '+
          'data-act="translate" data-id="'+escAttr(f.id)+'" data-target="'+escAttr(otherLang)+'" '+
          'title="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'" '+
          'aria-label="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'">'+
          (isTranslating ? esc(tMsg('card.translating')) : esc(tMsg('lang.' + showingLang))) +
        '</button>' +
      '</div>' +
      '<div class="finding-body" id="body-'+escAttr(f.id)+'">' +
        '<div class="grid2">' +
          '<div class="col">' +
            '<h4><span aria-hidden="true">🔍</span> '+esc(tMsg('card.problem'))+'</h4>' +
            '<p>'+esc(description)+'</p>' +
            (reasoning ? '<h4><span aria-hidden="true">🧠</span> '+esc(tMsg('card.reasoning'))+'</h4><p>'+esc(reasoning)+'</p>' : '') +
            (questionsRaised && questionsRaised.length ? '<h4><span aria-hidden="true">❓</span> '+esc(tMsg('card.questions'))+'</h4><ul class="qa">'+questionsRaised.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul>' : '') +
            (evidence && evidence.length ? '<h4><span aria-hidden="true">📎</span> '+esc(tMsg('card.evidence'))+'</h4>'+evidence.map(e=>'<div class="evidence">'+esc(e)+'</div>').join('') : '') +
          '</div>' +
          '<div class="col">' +
            '<h4><span aria-hidden="true">🛠</span> '+esc(tMsg('card.solution'))+'</h4>' +
            (fix
              ? '<p>'+esc(fixTranslated.description||'')+'</p><pre class="fix">'+esc(fixTranslated.replacement||'')+'</pre><div class="fix-conf">'+esc(tMsg('card.fixConfidence', {level: fix.confidence||''}))+'</div>'
              : '<p style="color:var(--fg-subtle)">'+esc(tMsg('card.noAutoFix'))+'</p>') +
            (alternativesConsidered && alternativesConsidered.length ? '<h4><span aria-hidden="true">🔀</span> '+esc(tMsg('card.alternatives'))+'</h4><ul class="qa">'+alternativesConsidered.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>' : '') +
            (f.relatedFiles && f.relatedFiles.length ? '<h4><span aria-hidden="true">🔗</span> '+esc(tMsg('card.relatedFiles'))+'</h4><ul class="qa">'+f.relatedFiles.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>' : '') +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          // Apply fix gets primary treatment when present — it's the most
          // action-oriented thing the user can do. The other buttons stay
          // ghost so the card's CTA is unambiguous.
          (fix ? '<button class="btn btn--primary btn--xs btn--apply" type="button" data-act="apply" data-id="'+escAttr(f.id)+'" title="'+escAttr(tMsg('card.applyFixTitle'))+'">'+
            '<span class="btn__icon" aria-hidden="true">✦</span> '+esc(tMsg('card.applyFix'))+
          '</button>' : '') +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="open" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.jumpToCode'))+'</button>' +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="ask" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.askFollowUp'))+'</button>' +
          // When the finding is silenced, dismiss makes no sense (it already is).
          // Swap it for a Restore action that removes the stored rule.
          (f.severity === 'silenced'
            ? '<button class="btn btn--ghost btn--xs" type="button" data-act="restore" data-id="'+escAttr(f.id)+'" title="'+escAttr(tMsg('card.restoreTitle'))+'">'+esc(tMsg('card.restore'))+'</button>'
            : '<button class="btn btn--ghost btn--xs" type="button" data-act="dismiss" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.dismiss'))+'</button>') +
        '</div>' +
      '</div>';
    return card;
  }

  // Re-render a single finding card in place (for translation toggles).
  function rerenderFinding(id){
    const card = $('#findings').querySelector('[data-id="'+CSS.escape(id)+'"]');
    if (!card) return;
    const f = state.findings.find(x => x.id === id);
    if (!f) return;
    const wasExpanded = card.getAttribute('aria-expanded') === 'true';
    const replacement = buildFindingCard(f);
    if (wasExpanded) replacement.setAttribute('aria-expanded', 'true');
    card.parentNode.replaceChild(replacement, card);
  }

  // ─── delegated event handlers ────────────────────────────────
  // Note: we widen to Element (not HTMLElement) so clicks inside <svg> — like
  // the chevron used to expand a finding — still hit the .closest() lookups.
  // SVGElement extends Element but NOT HTMLElement, which would otherwise
  // make the chevron uniquely unclickable.
  document.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (!(t instanceof Element)) return;

    // Header EN/ES toggle — postMessage to host, which calls back via
    // panel.onLanguageChanged() with the new lang.
    const langBtn = t.closest('.lang-btn');
    if (langBtn instanceof HTMLElement && langBtn.dataset.lang){
      vscode.postMessage({type:'setLang', lang: langBtn.dataset.lang});
      ev.stopPropagation();
      return;
    }

    if (t instanceof HTMLElement && t.matches('.filter')){
      state.filter = t.dataset.f;
      $$('.filter').forEach(b => b.setAttribute('aria-pressed', b === t ? 'true' : 'false'));
      renderFindings();
      return;
    }
    // Related-finding badge: scroll the target card into view, expand it, and
    // flash a brief highlight so the user can see where they landed.
    const related = t.closest('[data-related]');
    if (related instanceof HTMLElement){
      ev.preventDefault();
      const targetId = related.dataset.related;
      const targetCard = document.querySelector('.finding[data-id="'+CSS.escape(targetId)+'"]');
      if (targetCard){
        targetCard.setAttribute('aria-expanded', 'true');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.classList.add('finding--flash');
        setTimeout(() => targetCard.classList.remove('finding--flash'), 1200);
      }
      ev.stopPropagation();
      return;
    }
    const opener = t.closest('[data-open]');
    if (opener instanceof HTMLElement){
      vscode.postMessage({type:'open', id: opener.dataset.open});
      ev.stopPropagation();
      return;
    }
    const actEl = t.closest('[data-act]');
    if (actEl instanceof HTMLElement && actEl.dataset.id){
      const act = actEl.dataset.act;
      if (act === 'translate'){
        // Per-row language chip — request a translation if not cached, else
        // flip displayLang immediately and re-render this card alone.
        const id = actEl.dataset.id;
        const target = actEl.dataset.target;
        const f = state.findings.find(x => x.id === id);
        if (!f) { ev.stopPropagation(); return; }
        if ((f.originalLang || 'en') === target || (f.translations && f.translations[target])){
          f.displayLang = target;
          rerenderFinding(id);
        } else {
          f._translating = true;
          rerenderFinding(id);
          vscode.postMessage({type:'translateFinding', id, lang: target});
        }
        ev.stopPropagation();
        return;
      }
      const type =
        act === 'apply' ? 'applyFix'
        : act === 'ask' ? 'askFollowUp'
        : act === 'dismiss' ? 'dismiss'
        : act === 'restore' ? 'restore'
        : 'open';
      vscode.postMessage({type, id: actEl.dataset.id});
      ev.stopPropagation();
      return;
    }
    const head = t.closest('.finding-head');
    if (head){
      const card = head.closest('.finding');
      const expanded = card && card.getAttribute('aria-expanded') === 'true';
      if (card) card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
  });

  document.addEventListener('keydown', (ev)=>{
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (t.matches('[data-open]')){
      ev.preventDefault();
      vscode.postMessage({type:'open', id: t.dataset.open});
      return;
    }
    if (t.matches('.finding-head')){
      ev.preventDefault();
      const card = t.closest('.finding');
      const expanded = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
  });

  // ─── passes (analysis aspects) selector ─────────────────────
  /**
   * Render the read-only "active passes" chip row that lives between the
   * presets and the Advanced toggle. Groups by phase so the user gets a quick
   * sense of which phases will run without expanding the editable list.
   */
  function renderActivePasses(){
    const root = $('#active-passes');
    if (!root) return;
    const groups = [];
    let totalActive = 0;
    for (const phase of PHASE_ORDER){
      const inPhase = PASS_DEFS.filter(d => d.phase === phase);
      if (inPhase.length === 0) continue;
      const onCount = inPhase.filter(d => state.passes[d.key]).length;
      totalActive += onCount;
      const off = onCount === 0;
      const names = inPhase.filter(d => state.passes[d.key]).map(d => passLabel(d.key));
      const title = off
        ? phaseLabel(phase) + ' — none'
        : phaseLabel(phase) + ': ' + names.join(', ');
      groups.push(
        '<span class="active-passes__group'+(off?' active-passes__group--off':'')+'" title="'+escAttr(title)+'">' +
          '<span class="active-passes__group-label">'+esc(phaseLabel(phase))+'</span>' +
          '<span class="active-passes__group-count">'+onCount+'/'+inPhase.length+'</span>' +
        '</span>'
      );
    }
    if (totalActive === 0){
      root.innerHTML = '<span class="active-passes__empty">'+esc(tMsg('panel.activeNone'))+'</span>';
    } else {
      root.innerHTML = groups.join('');
    }
  }

  function applyAdvancedOpen(){
    const pane = $('#advanced-passes');
    const btn = $('#btn-toggle-advanced');
    if (!pane || !btn) return;
    const open = !!state.advancedOpen;
    pane.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = btn.querySelector('.advanced-toggle__label');
    if (label) label.textContent = tMsg(open ? 'panel.advancedHide' : 'panel.advancedShow');
  }

  function renderPasses(){
    const root = $('#passes');
    if (!root) return;
    let active = 0;
    const groupsHtml = [];
    for (const phase of PHASE_ORDER){
      const inPhase = PASS_DEFS.filter(d => d.phase === phase);
      if (inPhase.length === 0) continue;
      const pills = [];
      for (const def of inPhase){
        const on = !!state.passes[def.key];
        if (on) active++;
        const conditional = def.conditional
          ? '<span class="pass-pill__cond" title="'+escAttr(tMsg('passes.conditional.'+def.conditional))+'">'+esc(tMsg('passes.conditionalShort'))+'</span>'
          : '';
        pills.push(
          '<label class="pass-pill" data-key="'+escAttr(def.key)+'">' +
            '<input type="checkbox" data-pass="'+escAttr(def.key)+'"'+(on?' checked':'')+' aria-describedby="pass-tip-'+escAttr(def.key)+'">' +
            '<span class="pass-pill__label">'+esc(passLabel(def.key))+'</span>' +
            conditional +
            '<span class="pass-tip" id="pass-tip-'+escAttr(def.key)+'" role="tooltip">' +
              '<span class="pass-tip__title">'+esc(passLabel(def.key))+'</span>' +
              '<span class="pass-tip__hint">'+esc(passHint(def.key))+'</span>' +
              '<span class="pass-tip__detail">'+esc(passDetail(def.key))+'</span>' +
            '</span>' +
          '</label>'
        );
      }
      groupsHtml.push(
        '<div class="pass-group" data-phase="'+escAttr(phase)+'" title="'+escAttr(phaseHint(phase))+'">' +
          '<div class="pass-group__h">'+esc(phaseLabel(phase))+'</div>' +
          '<div class="pass-group__pills">'+pills.join('')+'</div>' +
        '</div>'
      );
    }
    root.innerHTML = groupsHtml.join('');
    const total = PASS_DEFS.length;
    $('#passes-count').textContent = active === total ? '('+tMsg('panel.selectAll').toLowerCase()+')' : '('+active+'/'+total+')';
    const est = $('#passes-estimate');
    if (est) est.textContent = active === 0 ? '' : formatEstimate();
    // Highlight matching preset (if any).
    const activePreset = activePresetName();
    for (const btn of document.querySelectorAll('.preset')){
      btn.setAttribute('aria-pressed', btn.dataset.preset === activePreset ? 'true' : 'false');
    }
    // Keep the collapsed-view active-pass chips in sync with checkbox state.
    renderActivePasses();
    syncStartBtn();
  }
  function applyPreset(name){
    const keys = PASS_PRESETS[name];
    if (!keys) return;
    const setKeys = new Set(keys);
    for (const def of PASS_DEFS) state.passes[def.key] = setKeys.has(def.key);
    renderPasses();
    persist();
  }
  function syncStartBtn(){
    // The Run card is the source of truth for button visual + enable state.
    renderRunCard();
  }

  // ─── collapse / expand left pane ────────────────────────────
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

  // ─── rail summary (when collapsed) ──────────────────────────
  function renderRail(){
    const dot = $('#rail-dot');
    const passWrap = $('#rail-pass');
    const branchesEl = $('#rail-branches');
    if (!dot) return;
    let state2 = 'idle';
    if (state.isRunning) state2 = 'running';
    else if (state.result){
      const v = state.result.summary && state.result.summary.overallVerdict;
      state2 = (v === 'block' || v === 'needs-changes') ? 'error' : 'done';
    }
    dot.dataset.state = state2;
    let branchesText = '';
    if (state.selectedHead && state.selectedBase){
      branchesText = state.selectedHead + ' ← ' + state.selectedBase;
    } else if (state.result){
      branchesText = (state.result.summary.branch||'') + ' ← ' + (state.result.summary.baseBranch||'');
    }
    branchesEl.textContent = branchesText;
    branchesEl.title = branchesText;
    // Current pass
    let passText = '';
    let running = null;
    for (const [k, v] of state.steps){
      if (v && v.status === 'running'){ running = { k, v }; break }
    }
    if (running) passText = passLabelLong(running.k);
    else if (!state.isRunning && state.result){
      const c = state.result.findings ? state.result.findings.filter(f=>!f.dismissed).length : 0;
      passText = c + ' findings';
    } else if (!state.isRunning){
      passText = 'idle';
    } else {
      passText = 'starting…';
    }
    passWrap.textContent = passText;
    passWrap.title = passText;
    // Counters
    const counts = {critical:0, major:0, minor:0, nit:0};
    for (const f of state.findings) if (!f.dismissed && counts[f.severity] != null) counts[f.severity]++;
    $('#rail-c-critical').textContent = counts.critical;
    $('#rail-c-major').textContent    = counts.major;
    $('#rail-c-minor').textContent    = counts.minor;
    $('#rail-c-nit').textContent      = counts.nit;
  }

  // Bind events for passes, collapse, category filters
  $('#passes').addEventListener('change', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    const key = t.dataset.pass;
    if (!key || !PASS_KEY_SET.has(key)) return;
    state.passes[key] = t.checked;
    renderPasses();
    persist();
  });
  $('#btn-toggle-advanced').addEventListener('click', () => {
    state.advancedOpen = !state.advancedOpen;
    applyAdvancedOpen();
    persist();
  });
  $('#presets').addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest('[data-preset]');
    if (!btn) return;
    ev.preventDefault();
    applyPreset(btn.dataset.preset);
  });

  $('#btn-collapse').addEventListener('click', () => setLeftCollapsed(!state.leftCollapsed));

  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === '\\\\'){
      ev.preventDefault();
      setLeftCollapsed(!state.leftCollapsed);
    }
  });

  $('#cat-filters').addEventListener('click', (ev) => {
    const t = ev.target instanceof HTMLElement ? ev.target.closest('[data-cat],[data-cat-all]') : null;
    if (!t) return;
    if (t.hasAttribute('data-cat-all')){
      state.categoryFilters.clear();
    } else {
      const c = t.getAttribute('data-cat');
      if (state.categoryFilters.has(c)) state.categoryFilters.delete(c);
      else state.categoryFilters.add(c);
    }
    renderFindings();
  });

  $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderFindings() });
  $('#btn-export').addEventListener('click', () => vscode.postMessage({type:'export'}));

  $('#branch-filter').addEventListener('input', (e) => { state.branchSearch = e.target.value; renderBranchPicker() });
  $('#show-local').addEventListener('change', (e) => { state.showLocal = e.target.checked; renderBranchPicker() });
  $('#show-remote').addEventListener('change', (e) => { state.showRemote = e.target.checked; renderBranchPicker() });
  $('#btn-fetch').addEventListener('click', () => {
    if (state.fetching) return;
    state.fetching = true;
    const b = $('#btn-fetch'); b.setAttribute('aria-disabled','true'); b.innerHTML = '<span aria-hidden="true">⟳</span> '+esc(tMsg('panel.fetching'));
    vscode.postMessage({type:'fetchBranches', prune:true});
  });
  $('#btn-start').addEventListener('click', () => {
    if (state.isRunning){
      // Acts as Stop while running. Disable immediately so it can't be
      // double-clicked while the cancellation propagates.
      const b = $('#btn-start');
      b.setAttribute('aria-disabled', 'true');
      b.innerHTML = '<span aria-hidden="true">■</span> '+esc(tMsg('panel.stopping'));
      vscode.postMessage({type:'cancelReview'});
      return;
    }
    if ($('#btn-start').getAttribute('aria-disabled') === 'true') return;
    vscode.postMessage({
      type:'startReview',
      base: state.selectedBase,
      head: state.selectedHead,
      passes: Object.assign({}, state.passes),
    });
  });
  $('#btn-resume').addEventListener('click', () => {
    if (!state.partial || state.isRunning) return;
    vscode.postMessage({type:'resumeReview'});
  });
  $('#btn-discard-partial').addEventListener('click', () => {
    if (!state.partial || state.isRunning) return;
    vscode.postMessage({type:'discardPartial'});
  });
  // Timeline buttons are rendered dynamically, so we delegate to the container.
  $('#timeline').addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const decisionBtn = t.closest('button[data-decision]');
    if (decisionBtn){
      const pass = decisionBtn.getAttribute('data-pass');
      const decision = decisionBtn.getAttribute('data-decision');
      if (pass && decision){
        // Disable the whole action row immediately so the user can't double-click
        // a different decision while the message is in flight.
        const row = decisionBtn.closest('.actions');
        if (row) row.querySelectorAll('button').forEach((b) => b.setAttribute('disabled','true'));
        vscode.postMessage({type:'passDecision', pass, decision});
      }
      return;
    }
    const retryBtn = t.closest('button[data-retry-pass]');
    if (retryBtn){
      const pass = retryBtn.getAttribute('data-retry-pass');
      if (pass){
        retryBtn.setAttribute('disabled','true');
        retryBtn.textContent = '↻ Retrying…';
        vscode.postMessage({type:'retryPass', pass});
      }
    }
  });
  $('#btn-clear-log').addEventListener('click', clearLive);
  $('#btn-copy-log').addEventListener('click', () => {
    const live = $('#live');
    const text = live.innerText || live.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const b = $('#btn-copy-log'); const orig = b.textContent;
      b.textContent = '✓ Copied'; setTimeout(() => b.textContent = orig, 1200);
    }).catch(() => {});
  });

  setInterval(() => {
    if (state.isRunning){
      renderTimeline();
      // Keep the elapsed-time counter in the Run card chip ticking.
      renderRunCard();
    }
  }, 1000);

  // ─── event stream ────────────────────────────────────────────
  function applyEvent(e){
    if (e.kind === 'start'){
      const pill = $('#branches');
      pill.setAttribute('data-visible', '1');
      pill.textContent = e.headBranch + ' ← ' + e.baseBranch;
      $('#verdict').dataset.v = 'running'; $('#verdict').textContent = 'RUNNING';
      state.findings = []; state.steps.clear(); state.result = null; state.isRunning = true;
      state.changeMap = []; state.consolidation = null; state.conditionalSkips = {};
      state.runStartedAt = e.at; state.currentPhase = null;
      $('#exec').hidden = true; $('#bullets').hidden = true;
      bumpCounter(); renderFindings(); renderTimeline(); renderBranchPicker(); renderResumeBanner(); renderChangeMap();
      appendLive('info', tMsg('log.reviewStarted', {head: e.headBranch, base: e.baseBranch}), 'review');
    } else if (e.kind === 'context'){
      state.steps.set('context', { status:'done', startedAt: e.at, endedAt: e.at, detail: (e.languages.join(', ')||'no lang') + (e.frameworks.length ? ' · '+e.frameworks.join(', ') : '') });
      renderTimeline();
      appendLive('info', tMsg('log.detected', {value: e.languages.join(', ')}), 'context');
    } else if (e.kind === 'diff'){
      state.steps.set('diff', { status:'done', startedAt: e.at, endedAt: e.at, detail: e.filesChanged+' files · +'+e.additions+' / -'+e.deletions + (e.truncated?' · TRUNCATED':'') });
      renderTimeline();
      appendLive('info', e.filesChanged+' files changed (+'+e.additions+'/-'+e.deletions+')'+(e.truncated?' [diff truncated]':''), 'diff');
    } else if (e.kind === 'passStart'){
      state.steps.set(e.pass, { status:'running', startedAt: e.at, detail: 'sending prompt to Claude…', lastActivity: '' });
      renderTimeline();
      appendLive('info', 'started', e.pass);
    } else if (e.kind === 'passOutput'){
      const step = state.steps.get(e.pass);
      const trimmed = String(e.chunk||'').trim();
      if (step){
        if (trimmed){
          step.lastActivity = trimmed.slice(0, 120);
          step.detail = 'streaming · ' + truncateForMeta(trimmed);
        }
        renderTimeline();
      }
      if (trimmed) appendLive('info', trimmed, e.pass);
    } else if (e.kind === 'passDone'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'done', endedAt: e.at, detail: e.findingCount+' findings · '+(Math.round(e.durationMs/100)/10)+'s' });
      renderTimeline();
      renderRunCard();
      appendLive('info', 'done · '+e.findingCount+' findings in '+(Math.round(e.durationMs/100)/10)+'s', e.pass);
    } else if (e.kind === 'passError'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'error', endedAt: e.at, detail: e.error });
      renderTimeline();
      appendLive('error', e.error, e.pass);
    } else if (e.kind === 'passAwaitDecision'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'awaitDecision', endedAt: e.at, detail: tMsg('timeline.failedDecision', {error: e.error}) });
      renderTimeline();
      appendLive('warn', 'awaiting decision: '+e.error, e.pass);
    } else if (e.kind === 'passDecisionMade'){
      const existing = state.steps.get(e.pass) || {};
      // The next event (passStart for retry, paused for stop, nothing for skip)
      // will update status. For 'skip' specifically, transition here so the
      // step doesn't linger in awaitDecision while no further event arrives.
      if (e.decision === 'skip'){
        state.steps.set(e.pass, { ...existing, status:'skipped', endedAt: e.at, detail: tMsg('timeline.skipped') });
      } else if (e.decision === 'stop'){
        state.steps.set(e.pass, { ...existing, status:'error', endedAt: e.at, detail: existing.detail || tMsg('timeline.failed') });
      }
      renderTimeline();
      appendLive('info', 'decision: '+e.decision, e.pass);
    } else if (e.kind === 'paused'){
      state.isRunning = false;
      state.runStartedAt = null; state.currentPhase = null;
      $('#verdict').dataset.v = 'needs-changes'; $('#verdict').textContent = 'PAUSED';
      renderBranchPicker();
      renderTimeline();
      renderResumeBanner();
      appendLive('warn', tMsg('log.reviewPaused', {reason: e.reason}), 'review');
    } else if (e.kind === 'retryPassStart'){
      // Reserved for future use — the orchestrator currently fires passStart
      // for retries too, which is enough for the timeline.
    } else if (e.kind === 'findingAdded'){
      state.findings.push(e.finding); bumpCounter(); renderFindings();
      // Bump the live findings counter on the Run card too.
      renderRunCard();
      appendLive('info', '+ ['+(e.finding.severity||'?')+'] '+e.finding.title+' @ '+e.finding.file+':'+e.finding.range.startLine, 'finding');
    } else if (e.kind === 'changeMap'){
      // explore pass produced its per-file classification — surface it as a
      // collapsible "Changes in this branch" section above the findings grid.
      state.changeMap = e.entries || [];
      renderChangeMap();
    } else if (e.kind === 'consolidation'){
      // Local Phase C ran. Stash so the consolidation timeline entry can show
      // a "−N merged" tooltip explaining the drop in finding count.
      state.consolidation = { before: e.before, after: e.after, merged: e.merged };
      // The orchestrator already replaced state.findings via splice, but the
      // panel keeps its own array — drop duplicates the same way.
      state.findings = dedupeFindingsClient(state.findings);
      bumpCounter(); renderFindings(); renderTimeline();
      appendLive('info', tMsg('consolidation.tooltip', {merged: e.merged, before: e.before, after: e.after}), 'consolidation');
    } else if (e.kind === 'conditionalSkip'){
      // A pass was skipped because a runtime condition was not met (e.g.
      // permute has nothing to alternativize). Render as a "skipped" timeline
      // entry whose tooltip explains why.
      state.conditionalSkips = state.conditionalSkips || {};
      state.conditionalSkips[e.pass] = e.reason;
      state.steps.set(e.pass, { status:'skipped', startedAt: e.at, endedAt: e.at, detail: tMsg('conditionalSkip.tooltip', {reason: e.reason}), autoSkipped: true });
      renderTimeline();
      appendLive('info', tMsg('conditionalSkip.tooltip', {reason: e.reason}), e.pass);
    } else if (e.kind === 'phaseStart'){
      // Track the current phase so the Run card can show "Phase X/N · label".
      state.currentPhase = e.phase;
      renderRunCard();
      appendLive('info', tMsg('phase.'+e.phase), 'phase');
    } else if (e.kind === 'log'){
      appendLive(e.level, e.message);
    } else if (e.kind === 'done'){
      $('#verdict').dataset.v = e.verdict; $('#verdict').textContent = (e.verdict||'').toUpperCase();
      state.isRunning = false; state.runStartedAt = null; state.currentPhase = null;
      renderBranchPicker(); renderResumeBanner();
    } else if (e.kind === 'cancelled'){
      $('#verdict').dataset.v = 'needs-changes'; $('#verdict').textContent = 'CANCELLED';
      state.isRunning = false; state.runStartedAt = null; state.currentPhase = null;
      renderBranchPicker(); renderResumeBanner();
    }
  }

  function applyResult(r){
    state.result = r;
    if (!r){
      $('#exec').hidden = true; $('#bullets').hidden = true;
      state.findings = []; bumpCounter(); renderFindings(); return;
    }
    state.findings = r.findings || [];
    bumpCounter(); renderFindings();
    $('#exec').hidden = false;
    $('#exec-text').textContent = r.summary.executiveSummary || '';
    $('#bullets').hidden = false;
    $('#concerns').innerHTML = (r.summary.topConcerns||[]).map(c => '<li>'+esc(c)+'</li>').join('') || '<li style="color:var(--fg-subtle)">none</li>';
    $('#strengths').innerHTML = (r.summary.strengths||[]).map(c => '<li>'+esc(c)+'</li>').join('') || '<li style="color:var(--fg-subtle)">none</li>';
    $('#verdict').dataset.v = r.summary.overallVerdict || 'approve-with-comments';
    $('#verdict').textContent = (r.summary.overallVerdict || '').toUpperCase();
    const pill = $('#branches');
    pill.setAttribute('data-visible', '1');
    pill.textContent = r.summary.branch + ' ← ' + r.summary.baseBranch;
  }

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'event') applyEvent(m.event);
    else if (m.type === 'result') applyResult(m.result);
    else if (m.type === 'branches') applyBranches(m);
    else if (m.type === 'fetchStart'){
      state.fetching = true;
      const b = $('#btn-fetch'); b.setAttribute('aria-disabled','true'); b.innerHTML = '<span aria-hidden="true">⟳</span> Fetching…';
      const errEl = $('#branch-error'); errEl.textContent = ''; errEl.setAttribute('data-empty', '1');
    } else if (m.type === 'fetchDone'){
      state.fetching = false;
      const b = $('#btn-fetch'); b.removeAttribute('aria-disabled'); b.innerHTML = '<span aria-hidden="true">⟳</span> Fetch';
      appendLive('info', '[fetch] ' + (m.output||'').trim());
    } else if (m.type === 'fetchError'){
      state.fetching = false;
      const b = $('#btn-fetch'); b.removeAttribute('aria-disabled'); b.innerHTML = '<span aria-hidden="true">⟳</span> '+esc(tMsg('panel.fetch'));
      const errEl = $('#branch-error'); errEl.textContent = tMsg('log.fetchFailed', {message: m.message}); errEl.removeAttribute('data-empty');
    } else if (m.type === 'fetchPrompt'){
      const b = $('#btn-fetch'); b.innerHTML = '<span aria-hidden="true">🔐</span> ' + esc(m.message.replace(/\.{3,}$/,'…'));
      appendLive('warn', '[fetch] '+m.message);
    } else if (m.type === 'branchError'){
      const errEl = $('#branch-error');
      if (m.message){ errEl.textContent = m.message; errEl.removeAttribute('data-empty') }
      else { errEl.textContent = ''; errEl.setAttribute('data-empty', '1') }
    } else if (m.type === 'aheadBehind'){
      if (m.reqId !== state.abReqId) return;
      state.abResult = m.result; renderAB();
    } else if (m.type === 'partialSummary'){
      state.partial = m.summary || null;
      renderResumeBanner();
      // Per-step Retry visibility depends on partial existing.
      renderTimeline();
    } else if (m.type === 'findingTranslationPending'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){ f._translating = true; rerenderFinding(m.id); }
    } else if (m.type === 'findingTranslated'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){
        f.translations = Object.assign({}, f.translations || {}, { [m.lang]: m.fields });
        f.displayLang = m.lang;
        delete f._translating;
        rerenderFinding(m.id);
      }
    } else if (m.type === 'findingTranslationError'){
      const f = state.findings.find(x => x.id === m.id);
      if (f){ delete f._translating; rerenderFinding(m.id); }
    }
  });

  // Initial paint so empty states render before any events arrive.
  applyLeftWidth();
  applyCollapsed();
  applyAdvancedOpen();
  renderPasses();
  renderActivePasses();
  renderTimeline();
  renderChangeMap();
  renderFindings();
  renderRunCard();
  bumpCounter();

  vscode.postMessage({type:'ready'});
})();
`;

export function buildClientScript(lang: Lang): string {
  const messagesJson = JSON.stringify(MESSAGES_DICT);
  const langJson = JSON.stringify(lang);
  return CLIENT_TEMPLATE
    .replace('__MESSAGES_JSON__', () => messagesJson)
    .replace('__LANG_JSON__', () => langJson);
}
