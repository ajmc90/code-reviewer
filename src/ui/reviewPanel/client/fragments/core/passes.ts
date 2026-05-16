/**
 * Pipeline pass definitions. Keys stay stable (used by orchestrator + persisted
 * state); labels/hints come from i18n at render time.
 *
 *   phase       — A discovery, B specialists, C consolidation (no toggle,
 *                 runs locally), D completeness, E critique.
 *   conditional — pass only fires under specific diff shapes (e.g. a11y on
 *                 UI-only diffs) so the user doesn't see zero findings.
 *   costSec     — rough lower/upper Claude-call duration in seconds for a
 *                 baseline diff (~300 lines). The runtime estimator scales
 *                 this by the actual diff size.
 */
export const PASSES = `
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
    fast:          ['structural', 'explore', 'critique'],
    deep:          PASS_DEFS.map(p => p.key),
    security:      ['security', 'critique'],
    performance:   ['performance', 'critique'],
    accessibility: ['accessibility', 'critique'],
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
`;
