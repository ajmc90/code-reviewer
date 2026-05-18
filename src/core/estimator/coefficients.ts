import { PassName } from '../events';

/**
 * Per-pass cost coefficients calibrated from 4 baseline runs (2026-05-17,
 * Opus 4.7 1M context, depth=deep, repo de testing).
 *
 * Honest caveat: with only one repo's worth of calibration data, the cold-
 * start estimator overshoots real cost by ~30-50%. This is intentional — the
 * coefficients are tuned to err on the high side so users see "cheaper than
 * expected" (which builds trust) rather than "more expensive than promised"
 * (which destroys it). Once 5+ samples accumulate per workspace, the
 * estimator switches to regression over real samples and the precision
 * tightens automatically.
 *
 * If you change these, document why and bump COEFFICIENTS_SCHEMA_VERSION so
 * stale samples get discarded.
 */
export const COEFFICIENTS_SCHEMA_VERSION = 1;

/**
 * Tokens of input that get cached at session creation time, per pass. Includes
 * the system preamble, the JSON contract, and the per-pass instructions —
 * everything that does NOT depend on the diff size.
 */
export const BASE_PROMPT_TOKENS: Partial<Record<PassName, number>> = {
  structural: 900,
  explore: 1600,
  security: 1500,
  performance: 1300,
  accessibility: 2200,
  tests: 1500,
  gaps: 2800,
  permute: 1700,
  critique: 4400,
  summary: 2400,
};

/**
 * Tokens of output the pass typically emits — median across runs, scaled by
 * how many findings it likely produces. Specialists that return `findings:[]`
 * still pay a few tokens for the closing brace, so the floor is 12.
 */
export const BASE_OUTPUT_TOKENS: Partial<Record<PassName, number>> = {
  structural: 1800,
  explore: 2500,       // varies hugely run-to-run — use median
  security: 200,       // often returns findings:[] post-PR-2a
  performance: 1100,
  accessibility: 1500,
  tests: 1300,
  gaps: 1500,
  permute: 3000,
  critique: 2000,
  summary: 900,
};

/**
 * How much extra output a pass generates per accumulated finding it has to
 * dedupe against (antiDuplicationBlock). Critique scales the most because
 * it serializes every prior finding. Specialists scale modestly.
 */
export const OUTPUT_PER_PRIOR_FINDING: Partial<Record<PassName, number>> = {
  explore: 0,
  security: 20,
  performance: 25,
  accessibility: 30,
  tests: 25,
  gaps: 35,
  permute: 80,         // re-serializes critical findings
  critique: 250,       // serializes ALL findings + decision payload
  summary: 60,
};

/**
 * Multiplier on the diff context size that each pass adds to its prompt.
 * structural sends just the rawDiff (~1×); other passes send the enrichedDiff
 * (rawDiff + loaded file contents) which can be 2-5× larger.
 */
export const DIFF_CONTEXT_MULTIPLIER: Partial<Record<PassName, number>> = {
  structural: 1.0,
  explore: 1.0,
  security: 1.0,
  performance: 1.0,
  accessibility: 1.0,
  tests: 1.0,
  gaps: 1.2,           // adds file list + conventions
  permute: 0.9,
  critique: 1.0,
  summary: 0.6,        // only sends diff stat + findings JSON
};

/**
 * Multiplier on the entire pass cost by reasoning depth setting.
 */
export const DEPTH_MULTIPLIER = {
  fast: 0.5,
  balanced: 0.8,
  deep: 1.0,
  obsessive: 1.4,
} as const;

/**
 * Anthropic pricing as of 2026-05 for Claude Opus 4.7 1M context. Per-million
 * token rates. Used to convert token estimates to a USD reference figure
 * shown only as supplementary info — subscription users do NOT pay this
 * amount; it's the API-direct equivalent.
 *
 * Source: anthropic.com/pricing. Bump alongside model changes.
 */
export const OPUS_4_7_1M_PRICING_USD = {
  inputPerMillion: 15.0,
  outputPerMillion: 75.0,
  cacheCreationPerMillion: 18.75,
  cacheReadPerMillion: 1.50,
} as const;

/**
 * Haiku per-call overhead — the CLI uses Haiku internally for routing and
 * inter-pass coordination. Empirically ~$0.005-$0.007 per Opus call when
 * session reuse is OFF; near-zero when ON (the same Haiku context is reused).
 */
export const HAIKU_OVERHEAD_USD = {
  perCallWithoutSessionReuse: 0.006,
  perCallWithSessionReuse: 0,  // observed: only structural pays Haiku in resume mode
};

/**
 * When session reuse is on, the second+ pass within a session reads more and
 * more from cache as the conversation grows. Empirically the cache-read ratio
 * is ~55% on pass 2 and climbs to ~82% by pass 8. Modeled as a per-pass-index
 * curve: pass N in the session has hit ratio = MIN(0.85, 0.4 + 0.07 * N).
 *
 * Observed in real runs (pass index → cache_read / total input):
 *   pass 1 (cold):  0%       → cacheCreation = 100%
 *   pass 2:         ~58%
 *   pass 3:         ~78%
 *   pass 4:         ~80%
 *   pass 5:         ~82%
 *   pass 6+:        ~82-85%
 */
export function sessionCacheHitRatio(passIndexInSession: number): number {
  if (passIndexInSession === 0) return 0;
  return Math.min(0.85, 0.4 + 0.07 * passIndexInSession);
}

/**
 * Variance multipliers around the central estimate. low/high are the 80% CI
 * derived from run-to-run variability we observed. worstCase accounts for
 * structural pass reading many extra files via tools (the biggest source of
 * unpredictability) and any retries.
 */
export const VARIANCE = {
  lowMultiplier: 0.7,
  highMultiplier: 1.5,
  worstCaseMultiplier: 2.5,
} as const;
