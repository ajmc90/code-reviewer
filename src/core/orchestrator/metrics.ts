import { CliResult, CliUsage, CliToolInvocation, CliModelUsage } from '../../claude/cliClient';

/**
 * Per-pass telemetry surfaced to the panel and the structured telemetry log.
 *
 * Fields land in the passDone event (all optional so older partial-state
 * snapshots without telemetry still rehydrate cleanly). The estimator uses
 * persisted samples of this shape to calibrate token + cost predictions
 * against the inputs we can observe at plan-time (prompt size, enriched diff
 * size, depth). costUsd is preferred over token-multiplied estimates because
 * the CLI knows its own prices better than we ever will.
 */
export interface PassMetrics {
  usage: CliUsage;
  costUsd?: number;
  modelUsage: Record<string, CliModelUsage>;
  toolsInvoked: CliToolInvocation[];
  apiRetries: number;
  promptChars: number;
  responseChars: number;
  cliDurationMs: number;
}

export function metricsFromCliResult(r: CliResult, promptChars: number): PassMetrics {
  return {
    usage: r.usage,
    costUsd: r.costUsd,
    modelUsage: r.modelUsage,
    toolsInvoked: r.toolsInvoked,
    apiRetries: r.apiRetries,
    promptChars,
    responseChars: r.text.length,
    cliDurationMs: r.durationMs,
  };
}

/**
 * Compute the "effective input tokens" the model actually processed for a
 * single call. The CLI reports input in three buckets — fresh, cache-read,
 * cache-creation — and `input_tokens` alone is misleading (it's only the
 * fresh portion). The model saw all three.
 */
export function effectiveInputTokens(u: CliUsage): number {
  return (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheCreationTokens ?? 0);
}

/**
 * Sum two CliUsage objects, treating undefined as 0. Used when a single pass
 * makes multiple CLI calls (none today, but the shape supports it).
 */
export function addUsage(a: CliUsage, b: CliUsage): CliUsage {
  const sum = (x?: number, y?: number): number | undefined =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  return {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    cacheReadTokens: sum(a.cacheReadTokens, b.cacheReadTokens),
    cacheCreationTokens: sum(a.cacheCreationTokens, b.cacheCreationTokens),
  };
}
