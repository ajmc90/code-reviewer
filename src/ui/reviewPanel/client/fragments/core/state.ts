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
    // Preflight diff size for the currently selected base/head, used to scale
    // the runtime estimate. null while in-flight or unknown; the request is
    // deduped by reqId.
    diffStatReqId: '', diffStat: null,
    // Per-pass median ms-per-line ratios learned from prior runs. Updated by
    // the host on 'ready'. Empty ratios → fall back to hardcoded costSec.
    calibration: { ratios: {} },
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
    // Wall-clock time when the current run started (for the Run card elapsed).
    // null when idle / done.
    runStartedAt: null,
    // Most recent phase the orchestrator entered. Drives the "Phase X/N · label"
    // line on the running Run card.
    currentPhase: null,
  };

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
`;
