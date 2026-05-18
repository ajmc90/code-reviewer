import { PassName } from '../events';
import { ReasoningDepth } from '../../types';
import {
  BASE_PROMPT_TOKENS,
  BASE_OUTPUT_TOKENS,
  OUTPUT_PER_PRIOR_FINDING,
  DIFF_CONTEXT_MULTIPLIER,
  DEPTH_MULTIPLIER,
  OPUS_4_7_1M_PRICING_USD,
  HAIKU_OVERHEAD_USD,
  sessionCacheHitRatio,
  VARIANCE,
} from './coefficients';

/**
 * Inputs to the estimator — everything we can observe BEFORE executing the
 * review. Token counts are predicted from these.
 */
export interface EstimatorInput {
  /** Bytes of the raw diff that will be sent (after contextExcludeGlobs filter). */
  rawDiffBytes: number;
  /**
   * Bytes of the enriched diff (rawDiff + loaded file contents). Predicted as
   * rawDiffBytes + min(loadedBudget, totalFileSizes). If unknown, estimator
   * uses 2× rawDiffBytes as a safe default (matches typical observed ratio).
   */
  enrichedDiffBytes?: number;
  /** Passes that will execute, in order. Pass already filtered for skipped (e.g. accessibility w/o UI files). */
  passes: PassName[];
  depth: ReasoningDepth;
  useSessionReuse: boolean;
  /**
   * Optional calibration factors fit from real samples. When provided, the
   * estimator multiplies its hardcoded predictions by these factors and
   * upgrades confidence accordingly. See regression.ts for how factors
   * are computed.
   */
  calibration?: { durationFactor: number; costFactor: number; sampleCount: number };
  /**
   * Rough estimate of how many findings the review will produce. Used to
   * model antiDuplicationBlock + critique scaling. Heuristic: 1 finding per
   * ~50 lines changed, capped at 30. The caller computes this from diff stats.
   */
  estimatedFindings: number;
}

export interface PassCostBreakdown {
  pass: PassName;
  tokens: number;
  usdReference: number;
  reason?: string;
}

/**
 * Output of the estimator. Tokens are the primary user-facing metric;
 * `usdReference` is the API-direct equivalent shown as supplementary info
 * with a disclaimer for subscription users.
 */
export interface CostEstimate {
  centralTokens: number;
  lowTokens: number;
  highTokens: number;
  worstCaseTokens: number;
  centralUsd: number;
  lowUsd: number;
  highUsd: number;
  worstCaseUsd: number;
  byPass: PassCostBreakdown[];
  /** Human-readable factors that explain the estimate. */
  factors: string[];
  /**
   * 'cold' = no calibration samples for this workspace, using hardcoded coefficients.
   * 'partial' = some samples (1-4) but not enough for regression.
   * 'calibrated' = 5+ samples, estimator uses regression over them.
   */
  confidence: 'cold' | 'partial' | 'calibrated';
  /** Estimated wall-clock duration in seconds (sum of typical per-pass durations). */
  estimatedDurationSec: number;
}

/**
 * Bytes-to-tokens conversion. ~4 chars/token for English/code is the standard
 * Anthropic heuristic. Used everywhere we have a char count and need tokens.
 */
function bytesToTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

/**
 * Typical wall-clock seconds per pass at a BASELINE diff of ~5K tokens
 * (small one-file change). Derived from the 4 calibration runs on the
 * SQL-injection repo. Real wall-clock scales sub-linearly with diff size —
 * see scaleDurationByDiff() below.
 */
const BASE_DURATION_SEC: Partial<Record<PassName, number>> = {
  structural: 40,
  explore: 70,
  security: 8,
  performance: 30,
  accessibility: 30,
  tests: 30,
  gaps: 35,
  permute: 70,
  critique: 40,
  summary: 18,
};

/**
 * Effective diff-size floor used by the duration scaler. Tiny diffs still
 * pay non-trivial wall-clock per pass (system preamble + structural-loaded
 * files + anti-dup), so the curve floors at 0.8× this baseline.
 */
const BASELINE_DIFF_TOKENS = 20000;

/**
 * Scale per-pass wall-clock by diff size. Real durations grow sub-linearly
 * (most of the input is cached and processed fast) but they grow faster
 * than logarithmically at the high end — large diffs trigger more tool
 * calls in the structural pass, which dominates wall-clock.
 *
 * Curve: factor = pow(tokens / baseline, 0.35), clamped to [0.8, 6.0]
 * Calibrated against three real runs (2026-05-17):
 *   230 tokens  → 0.80× → ~5 min  (real ~6 min on test repo)
 *   230K tokens → 2.35× → ~15 min (real ~10 min — overshoots; ok per "err high")
 *   1.05M tokens → 4.00× → ~25 min (real ~25 min on epic/live-session screenshot)
 *
 * The mid-range overshoot is intentional — preferring "finished faster than
 * estimated" over "took longer than promised" is the right side to err on.
 * When SampleStore accumulates 5+ runs per workspace, regression takes over
 * and removes the overshoot.
 */
function scaleDurationByDiff(diffTokens: number): number {
  if (diffTokens <= 0) return 0.8;
  const factor = Math.pow(diffTokens / BASELINE_DIFF_TOKENS, 0.35);
  return Math.min(6.0, Math.max(0.8, factor));
}

/**
 * Compute a cost estimate for a planned review. Returns tokens (primary
 * metric) + USD reference (with disclaimer for subscription users in the UI).
 *
 * The math:
 *   per-pass tokens = basePrompt + diffContext + output + carryOverOutput
 *   per-pass USD    = prompt-tokens × cache-pricing + output × output-pricing + haiku overhead
 *
 * Session reuse converts most cacheCreation into cacheRead for passes after
 * the first in their session group (much cheaper). We model this as a flat
 * SESSION_REUSE_CACHE_HIT_RATIO discount applied to passes 2+ in the noTools
 * session (everything except structural).
 */
export function estimateReviewCost(input: EstimatorInput): CostEstimate {
  const enrichedDiffBytes = input.enrichedDiffBytes ?? input.rawDiffBytes * 2;
  const diffTokens = bytesToTokens(enrichedDiffBytes);
  const rawDiffTokens = bytesToTokens(input.rawDiffBytes);
  const depthMul = DEPTH_MULTIPLIER[input.depth];
  const byPass: PassCostBreakdown[] = [];
  const factors: string[] = [];

  let runningFindings = 0;
  let nonStructuralPassIndex = 0;

  for (const pass of input.passes) {
    const basePrompt = BASE_PROMPT_TOKENS[pass] ?? 1500;
    const baseOutput = BASE_OUTPUT_TOKENS[pass] ?? 1500;
    const carryFactor = OUTPUT_PER_PRIOR_FINDING[pass] ?? 0;
    const diffMul = DIFF_CONTEXT_MULTIPLIER[pass] ?? 1.0;

    // structural uses rawDiff (no enriched context yet); others use enrichedDiff.
    const diffContextTokens = pass === 'structural' ? rawDiffTokens : diffTokens * diffMul;

    // Total input tokens this pass sees (cached + fresh combined).
    const inputTokens = basePrompt + diffContextTokens;

    // Output scales with depth and accumulated findings.
    const outputTokens = Math.round((baseOutput + carryFactor * runningFindings) * depthMul);

    // Cost split: structural is its own session; everything else shares a
    // noTools session. With session reuse on, the cache-read ratio grows with
    // position within the session (more context accumulated → more to reuse).
    const isStructural = pass === 'structural';
    const inSessionIndex = isStructural ? 0 : nonStructuralPassIndex;
    const cacheHitRatio = input.useSessionReuse ? sessionCacheHitRatio(inSessionIndex) : 0;
    const cacheReadTokens = Math.round(inputTokens * cacheHitRatio);
    const cacheCreationTokens = inputTokens - cacheReadTokens;

    // Total token count the user cares about (effective input that the model processed).
    const passTotalTokens = inputTokens + outputTokens;

    // USD reference using Opus 4.7 1M pricing.
    const isFirstInNoToolsSession = !isStructural && nonStructuralPassIndex === 0;
    const usdReference =
      (cacheReadTokens * OPUS_4_7_1M_PRICING_USD.cacheReadPerMillion +
        cacheCreationTokens * OPUS_4_7_1M_PRICING_USD.cacheCreationPerMillion +
        outputTokens * OPUS_4_7_1M_PRICING_USD.outputPerMillion) /
        1_000_000 +
      (input.useSessionReuse && !isStructural && !isFirstInNoToolsSession
        ? HAIKU_OVERHEAD_USD.perCallWithSessionReuse
        : HAIKU_OVERHEAD_USD.perCallWithoutSessionReuse);

    byPass.push({
      pass,
      tokens: passTotalTokens,
      usdReference: Math.round(usdReference * 10000) / 10000,
    });

    // Update accumulators for next pass.
    runningFindings += estimateFindingsForPass(pass, input.estimatedFindings, runningFindings);
    if (!isStructural) nonStructuralPassIndex++;
  }

  const centralTokens = byPass.reduce((a, p) => a + p.tokens, 0);
  const centralUsd = byPass.reduce((a, p) => a + p.usdReference, 0);

  // Factor summary for the UI tooltip.
  factors.push(`${input.passes.length} passes at depth=${input.depth}`);
  if (input.useSessionReuse) {
    factors.push('session reuse on — saves ~15% on input tokens');
  } else {
    factors.push('session reuse OFF — paying full cache creation each pass');
  }
  if (input.depth === 'obsessive') factors.push('depth=obsessive adds ~40% over deep');
  else if (input.depth === 'fast') factors.push('depth=fast halves the output budget');

  // Duration scales with depth AND with diff size (logarithmic). Without
  // the diff-size factor the estimator told users a 4M-token review takes
  // the same wall-clock as a 5K-token review, which is obviously wrong.
  //
  // KNOWN LIMITATION: this scaler doesn't capture "dense" diffs (refactors
  // with many findings per file) where actual duration can be ~2-3x the
  // prediction. A finding-density boost was tried but it caused larger runs
  // to explode (>200% overshoot). The cleanest fix is regression over real
  // samples from SampleStore — currently passive. See memory:
  // project_pause_resume_robustness and project_calibration_baseline.
  const durationDiffFactor = scaleDurationByDiff(diffTokens);
  let estimatedDurationSec = input.passes.reduce(
    (a, p) => a + (BASE_DURATION_SEC[p] ?? 30) * depthMul * durationDiffFactor,
    0,
  );

  // Apply calibration corrections from real samples, if provided. This is
  // the fix for the dense-diff underestimation: once 5+ samples exist for
  // a workspace, their actual/predicted ratios shift the prediction toward
  // the true distribution. Cold-start runs use factor = 1.0 (no correction).
  let centralCost = centralUsd;
  let centralCostByPass = byPass;
  let confidence: CostEstimate['confidence'] = 'cold';
  if (input.calibration && input.calibration.sampleCount >= 5) {
    estimatedDurationSec *= input.calibration.durationFactor;
    centralCost = centralUsd * input.calibration.costFactor;
    // Distribute the cost correction proportionally across passes so the
    // breakdown stays internally consistent (sum of byPass = total).
    centralCostByPass = byPass.map((p) => ({
      ...p,
      usdReference: round4(p.usdReference * input.calibration!.costFactor),
    }));
    confidence = 'calibrated';
    factors.push(`calibrated from ${input.calibration.sampleCount} prior runs (×${input.calibration.durationFactor.toFixed(2)} duration, ×${input.calibration.costFactor.toFixed(2)} cost)`);
  } else if (input.calibration && input.calibration.sampleCount > 0) {
    confidence = 'partial';
    factors.push(`${input.calibration.sampleCount} prior run(s) — need 5 for full calibration`);
  }

  return {
    centralTokens,
    lowTokens: Math.round(centralTokens * VARIANCE.lowMultiplier),
    highTokens: Math.round(centralTokens * VARIANCE.highMultiplier),
    worstCaseTokens: Math.round(centralTokens * VARIANCE.worstCaseMultiplier),
    centralUsd: round4(centralCost),
    lowUsd: round4(centralCost * VARIANCE.lowMultiplier),
    highUsd: round4(centralCost * VARIANCE.highMultiplier),
    worstCaseUsd: round4(centralCost * VARIANCE.worstCaseMultiplier),
    byPass: centralCostByPass,
    factors,
    confidence,
    estimatedDurationSec: Math.round(estimatedDurationSec),
  };
}

/**
 * Heuristic: how many findings this specific pass will likely add. explore
 * and the specialists each contribute a fraction of the total estimate;
 * structural/critique/summary contribute zero (structural doesn't emit
 * findings, critique modifies in place, summary aggregates).
 */
function estimateFindingsForPass(
  pass: PassName,
  totalEstimate: number,
  alreadyAccumulated: number,
): number {
  const remaining = Math.max(0, totalEstimate - alreadyAccumulated);
  switch (pass) {
    case 'explore':
      return Math.round(totalEstimate * 0.5);  // dominant source
    case 'security':
    case 'performance':
    case 'accessibility':
    case 'tests':
      return Math.min(remaining, Math.round(totalEstimate * 0.1));
    case 'gaps':
      return Math.min(remaining, Math.round(totalEstimate * 0.15));
    case 'permute':
      return Math.min(remaining, Math.round(totalEstimate * 0.2));
    default:
      return 0;
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Helper for the caller: derive an EstimatorInput from review options + diff
 * stats. Keeps the estimator pure (no I/O) while making it easy to call from
 * the controller without recomputing all these things.
 *
 * Findings heuristic uses lines-per-file as a density signal:
 *   - sparse diffs (many files, few lines each) → lower rate (1 per 80 lines)
 *   - dense diffs (few files, many lines each, often refactors) → higher rate
 *     (1 per 30 lines)
 * Capped at 80 (raised from 30 after observing a real run with 60 findings
 * on 5K lines / 8 files — the old cap underestimated cost on dense refactors
 * by ~half because the carry-over output of critique scales with findings).
 */
export function buildEstimatorInput(args: {
  rawDiffBytes: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged?: number;
  passes: PassName[];
  depth: ReasoningDepth;
  useSessionReuse: boolean;
}): EstimatorInput {
  const linesChanged = args.linesAdded + args.linesRemoved;
  const files = Math.max(1, args.filesChanged ?? 1);
  const linesPerFile = linesChanged / files;
  // Density-aware rate: dense diffs concentrate more findings per line.
  const linesPerFinding = linesPerFile > 300 ? 30 : linesPerFile > 100 ? 50 : 80;
  // Cap scales with diff size — diffs with thousands of files don't yield
  // proportionally more findings (the model consolidates aggressively in
  // critique). Empirically: 60 findings on 5K lines with 8 files is
  // plausible; 200 findings on 21K lines with 109 files is not.
  const cap = files >= 30 ? 40 : 80;
  const estimatedFindings = Math.min(cap, Math.max(3, Math.round(linesChanged / linesPerFinding)));
  return {
    rawDiffBytes: args.rawDiffBytes,
    passes: args.passes,
    depth: args.depth,
    useSessionReuse: args.useSessionReuse,
    estimatedFindings,
  };
}
