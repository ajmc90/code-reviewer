import * as vscode from 'vscode';
import { ReviewResult, isVisibleFinding } from '../../types';
import { HistoryEntry } from '../../ui/summaryView';
import { normalizeVerdict } from '../../claude/parser';

export const HISTORY_KEY = 'claudeReviewer.history';
export const HISTORY_RESULT_PREFIX = 'claudeReviewer.history.result.';
export const HISTORY_MAX = 5;

export function loadHistory(state: vscode.Memento): HistoryEntry[] {
  const raw = state.get<HistoryEntry[]>(HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  // Migrate-on-read: older entries may hold raw LLM verdict strings
  // ("DO NOT MERGE...") that break the UI. Normalize defensively so old
  // data never reaches the renderer with invalid enum values.
  return raw.map((e) => ({ ...e, verdict: normalizeVerdict(e.verdict) }));
}

/** Drop oldest entries past HISTORY_MAX, deleting their stored ReviewResult. */
async function pruneHistory(
  state: vscode.Memento,
  entries: HistoryEntry[],
): Promise<HistoryEntry[]> {
  if (entries.length <= HISTORY_MAX) return entries;
  const kept = entries.slice(0, HISTORY_MAX);
  const dropped = entries.slice(HISTORY_MAX);
  for (const d of dropped) {
    await state.update(HISTORY_RESULT_PREFIX + d.id, undefined);
  }
  return kept;
}

export async function recordHistory(
  state: vscode.Memento,
  r: ReviewResult,
): Promise<HistoryEntry[]> {
  const sev = r.findings.reduce<Record<string, number>>((acc, f) => {
    if (isVisibleFinding(f)) acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});
  const id = `${r.summary.baseBranch}|${r.summary.branch}|${Date.parse(r.summary.generatedAt) || Date.now()}`;
  const entry: HistoryEntry = {
    id,
    baseBranch: r.summary.baseBranch,
    headBranch: r.summary.branch,
    verdict: normalizeVerdict(r.summary.overallVerdict),
    findingCount: r.findings.filter(isVisibleFinding).length,
    critical: sev.critical || 0,
    major: sev.major || 0,
    finishedAt: Date.parse(r.summary.generatedAt) || Date.now(),
    durationMs: r.durationMs,
  };
  // Keep the most recent entry per (base, head) pair.
  const existing = loadHistory(state);
  const stale = existing.filter(
    (h) => h.baseBranch === entry.baseBranch && h.headBranch === entry.headBranch,
  );
  for (const s of stale) {
    await state.update(HISTORY_RESULT_PREFIX + s.id, undefined);
  }
  const next = await pruneHistory(state, [
    entry,
    ...existing.filter((h) => !(h.baseBranch === entry.baseBranch && h.headBranch === entry.headBranch)),
  ]);
  await state.update(HISTORY_RESULT_PREFIX + id, r);
  await state.update(HISTORY_KEY, next);
  return next;
}

export function loadHistoryResult(state: vscode.Memento, id: string): ReviewResult | null {
  const r = state.get<ReviewResult>(HISTORY_RESULT_PREFIX + id);
  if (!r) return null;
  // Same migration-on-read as loadHistory — older cached results may hold
  // raw LLM verdict strings that the UI can't render safely.
  if (r.summary) {
    r.summary.overallVerdict = normalizeVerdict(r.summary.overallVerdict);
  }
  return r;
}
