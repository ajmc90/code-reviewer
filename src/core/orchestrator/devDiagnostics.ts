import { Finding, PartialReviewState, isVisibleFinding } from '../../types';
import { OrchestratorDeps } from './types';

/**
 * Developer diagnostics: emit a structured dump of every surviving finding to
 * the output channel at end of run. Off by default — see OrchestratorDeps
 * developerDiagnostics + claudeReviewer.developerDiagnostics setting.
 *
 * Designed for A/B comparing prompt or cost-saving changes against a baseline.
 * The format is one finding per line with prefix `[devfinding]` so it can be
 * grep'd out of the log and diff'd between two runs:
 *
 *   grep '^\[devfinding\]' run-before.log | sort > before.txt
 *   grep '^\[devfinding\]' run-after.log  | sort > after.txt
 *   diff before.txt after.txt
 *
 * Fields are stable, machine-friendly, and exclude volatile data (the id is
 * generated per-run from Date.now() so two runs of the same review would
 * always diff if id were included).
 */
export function emitDeveloperDiagnostics(
  deps: OrchestratorDeps,
  state: PartialReviewState,
): void {
  if (!deps.developerDiagnostics) return;
  const visible = state.findings.filter(isVisibleFinding);
  const hidden = state.findings.filter((f) => !isVisibleFinding(f));

  deps.log(`[devdiag] --- end-of-run dump ---`);
  deps.log(`[devdiag] visible=${visible.length} hidden=${hidden.length} totalRaw=${state.findings.length}`);

  // Group visible findings by pass for at-a-glance comparison.
  const byPass = new Map<string, Finding[]>();
  for (const f of visible) {
    const pass = f.pass ?? 'unknown';
    const arr = byPass.get(pass) ?? [];
    arr.push(f);
    byPass.set(pass, arr);
  }
  for (const [pass, list] of [...byPass.entries()].sort()) {
    deps.log(`[devdiag] pass ${pass}: ${list.length} visible findings`);
  }

  // One canonical line per visible finding. Sort by file then line so two runs
  // produce deterministic order regardless of internal ordering changes.
  const sorted = [...visible].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.range.startLine - b.range.startLine;
  });
  for (const f of sorted) {
    const record = {
      severity: f.severity,
      category: f.category,
      file: f.file,
      line: f.range.startLine,
      endLine: f.range.endLine,
      pass: f.pass,
      title: f.title,
      decision: f.decision ?? null,
    };
    deps.log(`[devfinding] ${JSON.stringify(record)}`);
  }

  // Hidden findings (dropped/merged by critique) — useful to see what critique
  // killed when comparing runs.
  if (hidden.length > 0) {
    for (const f of hidden) {
      const record = {
        severity: f.severity,
        category: f.category,
        file: f.file,
        line: f.range.startLine,
        pass: f.pass,
        title: f.title,
        decision: f.decision ?? 'hidden',
        mergedInto: f.mergedIntoId ?? null,
      };
      deps.log(`[devhidden] ${JSON.stringify(record)}`);
    }
  }
  deps.log(`[devdiag] --- end-of-run dump complete ---`);
}
