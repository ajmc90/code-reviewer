import * as vscode from 'vscode';
import { PartialReviewState, isVisibleFinding } from '../../types';
import { PartialReviewSummary } from '../../ui/reviewPanel';

export const PARTIAL_KEY = 'claudeReviewer.partialState';

export function loadPartial(
  state: vscode.Memento,
  log: (msg: string) => void,
): PartialReviewState | null {
  const raw = state.get<PartialReviewState>(PARTIAL_KEY);
  if (!raw) return null;
  if (raw.version !== 1) {
    log(`Ignoring partial review state with unknown version: ${(raw as any).version}`);
    return null;
  }
  return raw;
}

export async function savePartial(
  state: vscode.Memento,
  value: PartialReviewState | null,
): Promise<void> {
  await state.update(PARTIAL_KEY, value);
}

export function buildSummary(s: PartialReviewState | null): PartialReviewSummary | null {
  if (!s) return null;
  return {
    baseBranch: s.opts.baseBranch,
    headBranch: s.opts.headBranch,
    completedPasses: [...s.completedPasses],
    skippedPasses: [...s.skippedPasses],
    plannedPasses: s.plannedPasses ? [...s.plannedPasses] : undefined,
    findingCount: s.findings.filter(isVisibleFinding).length,
    pausedReason: s.pausedReason,
    startedAt: s.startedAt,
  };
}
