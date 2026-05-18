import { PartialReviewState } from '../../types';
import { PassName } from '../events';
import { OrchestratorDeps, ReviewMetricsSummary } from './types';
import { PassMetrics, effectiveInputTokens } from './metrics';
import { CliUsage } from '../../claude/cliClient';

export interface PassTelemetryInput {
  pass: PassName;
  findingCount: number;
  /** Wall-clock duration of the entire pass step (CLI + parse + state work). */
  passDurationMs: number;
  state: PartialReviewState;
  metrics: PassMetrics;
}

/**
 * Per-review accumulator for the metrics summary. Lives for one review run;
 * the orchestrator creates one at the start of review() and the telemetry
 * emitter folds each pass's metrics into it. At end of run, the orchestrator
 * calls finalizeReviewMetrics to get a summary it can hand to the callback.
 */
export class ReviewMetricsAccumulator {
  private totalTokens = 0;
  private totalUsd = 0;
  private perPassUsd: Record<string, number> = {};
  private perPassTokens: Record<string, number> = {};
  private passesRun: string[] = [];

  add(pass: PassName, metrics: PassMetrics): void {
    const passTokens = effectiveInputTokens(metrics.usage) + (metrics.usage.outputTokens ?? 0);
    const passUsd = metrics.costUsd ?? 0;
    this.totalTokens += passTokens;
    this.totalUsd += passUsd;
    this.perPassUsd[pass] = (this.perPassUsd[pass] ?? 0) + passUsd;
    this.perPassTokens[pass] = (this.perPassTokens[pass] ?? 0) + passTokens;
    if (!this.passesRun.includes(pass)) this.passesRun.push(pass);
  }

  finalize(actualFindingsCount: number, enrichedDiffBytes: number, totalDurationMs: number): ReviewMetricsSummary {
    return {
      totalTokens: this.totalTokens,
      totalUsd: Math.round(this.totalUsd * 10000) / 10000,
      perPassUsd: { ...this.perPassUsd },
      perPassTokens: { ...this.perPassTokens },
      passesRun: [...this.passesRun],
      actualFindingsCount,
      enrichedDiffBytes,
      totalDurationMs,
    };
  }
}

/**
 * Emit one NDJSON line per pass to the output channel with everything the
 * estimator (and any forensic reporter, like the one used after the
 * epic/live-session run) needs to calibrate token predictions from real runs.
 *
 * Prefix `[telemetry]` makes the line easy to grep out of the live log when
 * the user (or another Claude session) wants to extract metrics. The JSON is
 * inline single-line so it's safe to copy-paste into a forensic prompt and
 * parse with jq.
 *
 * Persistence to disk is intentionally out of scope here — that lands when we
 * wire the estimator's sample store. This emitter is the single source the
 * store will subscribe to.
 */
export function emitTelemetry(
  deps: OrchestratorDeps,
  input: PassTelemetryInput,
  accumulator?: ReviewMetricsAccumulator,
): void {
  const { pass, findingCount, passDurationMs, state, metrics } = input;
  if (accumulator) accumulator.add(pass, metrics);
  // Reduce modelUsage to a compact { modelId: {in,out,cacheR,cacheC,$} } shape
  // — keeps the line greppable without exploding when both Haiku and Opus
  // contributed to the same call.
  const modelBreakdown: Record<string, unknown> = {};
  for (const [model, u] of Object.entries(metrics.modelUsage)) {
    modelBreakdown[model] = {
      in: u.inputTokens ?? null,
      out: u.outputTokens ?? null,
      cacheR: u.cacheReadTokens ?? null,
      cacheC: u.cacheCreationTokens ?? null,
      usd: u.costUsd ?? null,
    };
  }
  const record = {
    pass,
    durationMs: passDurationMs,
    cliDurationMs: metrics.cliDurationMs,
    // Token buckets as the CLI reports them. inputTokens here is only the
    // fresh portion; effectiveInputTokens is what the model actually saw.
    inputTokens: metrics.usage.inputTokens ?? null,
    outputTokens: metrics.usage.outputTokens ?? null,
    cacheReadTokens: metrics.usage.cacheReadTokens ?? null,
    cacheCreationTokens: metrics.usage.cacheCreationTokens ?? null,
    effectiveInputTokens: effectiveInputTokens(metrics.usage),
    costUsd: metrics.costUsd ?? null,
    modelUsage: modelBreakdown,
    promptChars: metrics.promptChars,
    responseChars: metrics.responseChars,
    findingsEmitted: findingCount,
    findingsAccumulated: state.findings.length,
    tools: metrics.toolsInvoked.map((t) => t.name),
    retries: metrics.apiRetries,
    diffSize: state.rawDiff?.length ?? null,
    enrichedDiffSize: state.enrichedDiff?.length ?? null,
    loadedFilesCount: state.loadedFiles?.length ?? null,
    depth: state.opts?.depth ?? null,
    model: deps.model ?? null,
    schemaVersion: 2,
  };
  deps.log(`[telemetry] ${JSON.stringify(record)}`);

  // Also surface a one-line human-readable summary in the panel's live log so
  // users see the cost of each pass without having to open the output channel.
  // The full NDJSON above stays as the source of truth for forensics.
  if (deps.events) {
    const line = formatTelemetrySummary(metrics, passDurationMs);
    // The live log renderer treats each chunk as a separate line and trims
    // trailing whitespace, so no surrounding newlines needed — just the line.
    deps.events.emit({ kind: 'passOutput', pass, chunk: `◆ ${line}`, at: Date.now() });
  }
}

/**
 * Human-readable single-line summary of a pass's telemetry, suitable for the
 * live log panel. Shows cost (the number users care about most), input/output
 * tokens, cache hit rate, and wall-clock time. Tools are mentioned only when
 * present so the line stays compact for the common no-tools case.
 */
function formatTelemetrySummary(metrics: PassMetrics, passDurationMs: number): string {
  const cost = typeof metrics.costUsd === 'number' ? `$${metrics.costUsd.toFixed(4)}` : 'cost=?';
  const effIn = effectiveInputTokens(metrics.usage);
  const out = metrics.usage.outputTokens ?? 0;
  const cachePct = cacheHitPercentage(metrics.usage);
  const cacheStr = cachePct !== null ? ` (cache ${cachePct}%)` : '';
  const seconds = (passDurationMs / 1000).toFixed(1);
  const toolsStr = metrics.toolsInvoked.length > 0 ? `  tools=${metrics.toolsInvoked.length}` : '';
  const retriesStr = metrics.apiRetries > 0 ? `  retries=${metrics.apiRetries}` : '';
  return `${cost}  in=${effIn}${cacheStr}  out=${out}  ${seconds}s${toolsStr}${retriesStr}`;
}

/**
 * Cache hit percentage = cacheRead / (cacheRead + cacheCreation + fresh).
 * Returns null when there's no usage data — silent rather than reporting 0%
 * which would mislead the reader.
 */
function cacheHitPercentage(u: CliUsage): number | null {
  const read = u.cacheReadTokens ?? 0;
  const total = effectiveInputTokens(u);
  if (total <= 0) return null;
  return Math.round((read / total) * 100);
}
