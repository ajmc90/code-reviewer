/**
 * Runtime estimator. Predicts how long a review will take given the active
 * passes, the preflight diff size, and any per-pass calibration data we've
 * collected from prior runs.
 *
 * Reads: state.passes, state.diffStat, state.calibration, PASS_DEFS,
 *        PASS_PRESETS, tMsg.
 * Writes: nothing.
 */
export const ESTIMATE = `
  // Baseline diff size the hardcoded costSec ranges were calibrated against.
  // Used both for the default-scale fallback and as the denominator when we
  // record samples, so they stay comparable.
  const BASELINE_DIFF = 300;

  /**
   * Sublinear scale factor: a Claude pass has a large fixed overhead (prompt
   * setup, tool use, parsing) that does NOT shrink to zero on tiny diffs.
   * A pure linear scale gave nonsense like "6s" for two-pass runs on small
   * diffs. We use 0.7 + 0.3*(diff/baseline) clamped to [0.5, 2.0]:
   *   - diff 0       → 0.70 of default (overhead always present)
   *   - diff 300     → 1.00 (baseline)
   *   - diff 1000    → 1.70
   *   - diff 5000+   → 2.00 (clamped — Claude doesn't scale arbitrarily)
   * The same shape is used for calibrated estimates so they never collapse.
   */
  function diffScale(diff){
    const raw = 0.7 + 0.3 * (diff / BASELINE_DIFF);
    return Math.max(0.5, Math.min(2.0, raw));
  }

  function activePassCount(){
    let n = 0;
    for (const def of PASS_DEFS) if (state.passes[def.key]) n++;
    return n;
  }

  function currentDiffSize(){
    const ds = state.diffStat;
    if (ds && (ds.additions != null || ds.deletions != null)){
      return Math.max(25, (ds.additions || 0) + (ds.deletions || 0));
    }
    return BASELINE_DIFF;
  }

  /**
   * Compute estimated runtime for the active passes, returning {lo, hi, source}
   * where source is 'calibrated' (≥1 pass has learned ratios) or 'default'.
   * Strategy per pass:
   *   - If we have a learned median ms-per-line ratio for that pass, scale by
   *     the current diff size. Lo/hi widen the median ±25% to acknowledge
   *     variance — it's an estimate, not a guarantee.
   *   - Otherwise use the hardcoded costSec, scaled by diff/BASELINE_DIFF so
   *     small diffs don't show "5 minutes" for a one-line change.
   */
  function computeEstimateSec(){
    const diff = currentDiffSize();
    const scale = diffScale(diff);
    const ratios = (state.calibration && state.calibration.ratios) || {};
    let lo = 0, hi = 0, n = 0, calibrated = 0;
    for (const def of PASS_DEFS){
      if (!state.passes[def.key]) continue;
      n++;
      const r = ratios[def.key];
      if (r && r.medianMsPerLine > 0){
        // Apply the same sublinear shape to calibrated ratios: a single
        // historical sample on a 50-line diff would otherwise predict 6s for
        // a brand-new pass, which is unrealistic given Claude's overhead.
        // We treat the recorded ratio as if it were measured at BASELINE_DIFF
        // and rescale to the current diff via diffScale().
        const baselineSec = (r.medianMsPerLine * BASELINE_DIFF) / 1000;
        const sec = baselineSec * scale;
        lo += sec * 0.75;
        hi += sec * 1.25;
        calibrated++;
      } else {
        lo += def.costSec[0] * scale;
        hi += def.costSec[1] * scale;
      }
    }
    const source = n === 0 ? 'default' : (calibrated >= n / 2 ? 'calibrated' : (calibrated > 0 ? 'mixed' : 'default'));
    return { lo, hi, n, source };
  }

  function fmtSec(s){
    if (s < 60) return Math.round(s) + 's';
    return Math.round(s / 60) + 'm';
  }
  function fmtRange(lo, hi){
    const a = fmtSec(lo), b = fmtSec(hi);
    return a === b ? a : (a + '–' + b);
  }

  /** Sum costSec ranges for active passes → "~Xm" / "~X–Ym". */
  function formatEstimate(){
    const { lo, hi, n, source } = computeEstimateSec();
    if (n === 0) return '';
    const range = fmtRange(lo, hi);
    const base = tMsg('passes.estimate', { range: range, calls: n });
    if (source === 'calibrated') return base + ' · ' + tMsg('passes.calibrated');
    if (source === 'mixed')      return base + ' · ' + tMsg('passes.mixedCalibration');
    return base;
  }

  /** Returns just the time range string (e.g. "2–3m") used in the time chip. */
  function formatEstimateRange(){
    const { lo, hi, n } = computeEstimateSec();
    if (n === 0) return '';
    return fmtRange(lo, hi);
  }

  /** 'calibrated' | 'mixed' | 'default' — drives the chip's ⓘ tooltip. */
  function estimateSource(){
    return computeEstimateSec().source;
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
`;
