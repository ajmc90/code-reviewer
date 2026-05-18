/**
 * The shared state hub: every render and event handler reads (and many of
 * them mutate) the same `state` object. We also expose persist() so any
 * mutation that should survive a panel reload can flush itself.
 *
 * Loaded after PASSES (uses PASS_DEFS to seed defaultPasses) and before any
 * renderer.
 */
export const STATE = `
  // Hoisted intentionally above the state literal because state.leftWidth
  // calls into it during initialization.
  function clampLeftWidth(n){
    const x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.min(720, Math.max(280, Math.round(x)));
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
    // Stacked-layout (mobile) height of the left pane, in px. 0 = auto
    // (content-driven). Set the first time the user drags the horizontal
    // gutter; persists across sessions.
    leftHeight: Number(persisted.leftHeight) || 0,
    runningPass: null,
    // Most recent partial-state summary from the host. null = no paused review.
    partial: null,
    // Per-file classification emitted by the explore pass. Rendered above the
    // findings grid as a collapsible map. [] = not received yet.
    changeMap: [],
    changeMapCollapsed: !!persisted.changeMapCollapsed,
    // Last consolidation event {before, after, merged}. null = no consolidation yet.
    consolidation: null,
    // Buffer of findings per pass while the pass is still running. Flushed to
    // state.findings on passDone so the user never sees a finding appear and
    // then vanish during consolidation. Restored partial state bypasses this
    // (those findings are already consolidated).
    pendingByPass: new Map(),
    // Map of pass → reason it was auto-skipped (no UI checkbox involvement).
    conditionalSkips: {},
    // When true, the editable per-pass pills are shown. When false, only the
    // preset row + read-only "active passes" chips are visible. Persisted so
    // power users don't have to re-open it every session.
    advancedOpen: !!persisted.advancedOpen,
    // Live log panel toggle. Collapsed by default to keep the left pane tidy;
    // persisted so users who keep it open don't have to re-expand each session.
    logOpen: !!persisted.logOpen,
    // Review summary panel collapse. Default expanded so a fresh review shows
    // the verdict + concerns immediately; once the user collapses it, the
    // preference sticks across sessions (verdict pill + sev chips remain
    // visible in the bar even when collapsed).
    summaryCollapsed: !!persisted.summaryCollapsed,
    // Wall-clock time when the current run started (for the Run card elapsed).
    // null when idle / done.
    runStartedAt: null,
    // Most recent phase the orchestrator entered. Drives the "Phase X/N · label"
    // line on the running Run card.
    currentPhase: null,
    // Pre-run cost estimate. Populated by the 'estimate' message from the
    // host whenever branches/passes/depth change. null = no estimate yet (no
    // branches selected, or compute failed). estimateLoading = request in
    // flight (covers the chip with a spinner so the user knows we're working).
    estimate: null,
    estimateLoading: false,
    // Review config that the estimator needs and the Advanced Options panel
    // toggles. Initial defaults match the controller's reading of the same
    // settings; once the host pushes 'settings' on ready, these get replaced
    // with the real values from settings.json.
    depth: 'deep',
    useSessionReuse: true,
    developerDiagnostics: false,
    // Watchdog handle for the Stop button. When the user clicks Stop we set
    // this; it fires after 12s if no cancelled/done/paused event arrived,
    // and force-resets the running state. Cleared by every terminal event.
    stopWatchdog: null,
  };

  function persist(){
    if (!vscode.setState) return;
    vscode.setState({
      passes: state.passes,
      leftCollapsed: state.leftCollapsed,
      leftWidth: state.leftWidth,
      leftHeight: state.leftHeight,
      changeMapCollapsed: state.changeMapCollapsed,
      advancedOpen: state.advancedOpen,
      logOpen: state.logOpen,
      summaryCollapsed: state.summaryCollapsed,
    });
  }
`;
