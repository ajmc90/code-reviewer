import { ReviewSample } from './sampleStore';

/**
 * Simple regression over real review samples to calibrate the estimator
 * beyond the hardcoded coefficients. Used once a workspace has accumulated
 * enough samples to fit a model (default: 5).
 *
 * We DON'T do a full multi-feature regression because:
 *   - The feature space is small (diff size, findings, file count, depth).
 *   - Multivariate regression over <20 samples overfits badly.
 *   - We want predictions that degrade gracefully outside the training range.
 *
 * Instead we fit a simple multiplicative correction: compare actual vs the
 * estimator's prediction across the samples, take the median ratio per
 * "regime" (depth × session reuse), and apply that as a correction factor
 * to future predictions. This captures the systematic bias of the hardcoded
 * coefficients without trying to learn the entire function from scratch.
 */

export interface RegressionFactors {
  /**
   * Multiplier applied to the estimator's predicted duration. > 1 means
   * the hardcoded coefficients systematically underestimate; < 1 means
   * they overestimate.
   */
  durationFactor: number;
  /** Same idea for total cost in USD. */
  costFactor: number;
  /** How many samples were used to fit. < 5 → factors should not be trusted. */
  sampleCount: number;
  /** Median absolute percent error of duration predictions on samples. */
  durationMAPE: number;
  /** Median absolute percent error of cost predictions on samples. */
  costMAPE: number;
}

/**
 * Fit correction factors from samples. The caller is responsible for
 * computing the estimator's prediction for each sample (we don't want to
 * pull the estimator in here and create a circular dependency).
 *
 * Input rows pair each sample with what the estimator WOULD have predicted
 * for that sample's diff stats. The function compares prediction to actual
 * and returns a multiplicative correction.
 */
export interface SamplePredictionPair {
  sample: ReviewSample;
  /** What the hardcoded estimator predicted for this sample's inputs. */
  predictedDurationMs: number;
  predictedUsd: number;
}

export function fitRegression(rows: SamplePredictionPair[]): RegressionFactors {
  // Filter out samples that don't have the data we need (older schema or
  // failed runs that didn't capture duration).
  const usable = rows.filter(
    (r) => r.sample.totalDurationMs > 0 && r.predictedDurationMs > 0 && r.predictedUsd > 0,
  );
  if (usable.length === 0) {
    return { durationFactor: 1.0, costFactor: 1.0, sampleCount: 0, durationMAPE: 0, costMAPE: 0 };
  }

  // Compute the actual/predicted ratio for each sample. Median (not mean)
  // because a single huge outlier shouldn't dominate the correction.
  const durRatios = usable.map((r) => r.sample.totalDurationMs / r.predictedDurationMs);
  const costRatios = usable.map((r) => r.sample.totalUsd / r.predictedUsd);

  // MAPE — useful diagnostic. If MAPE is huge even after fitting, the
  // hardcoded model is mis-shaped and a multiplicative correction can't
  // save it. We surface MAPE so the UI can flag low-confidence calibration.
  const durErrs = usable.map((r) => Math.abs(r.sample.totalDurationMs - r.predictedDurationMs * median(durRatios)) / r.sample.totalDurationMs);
  const costErrs = usable.map((r) => Math.abs(r.sample.totalUsd - r.predictedUsd * median(costRatios)) / r.sample.totalUsd);

  return {
    // Clamp the correction so a single anomalous run can't swing the
    // estimator into producing absurd predictions. Range allows roughly
    // 0.4× to 2.5× correction — that's enough to fix systematic bias
    // without letting the model lose all its calibrated coefficients.
    durationFactor: clamp(median(durRatios), 0.4, 2.5),
    costFactor: clamp(median(costRatios), 0.4, 2.5),
    sampleCount: usable.length,
    durationMAPE: median(durErrs),
    costMAPE: median(costErrs),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
