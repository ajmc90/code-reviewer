import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT_FINDINGS_ONLY, antiDuplicationBlock, changeMapBlock, truncate } from '../shared';

export function buildPermutePrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  diff: string;
  criticalFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  const focus = args.criticalFindings
    .slice(0, 12)
    .map(
      (f, i) =>
        `  ${i + 1}. [${f.file}:${f.startLine}${f.endLine !== f.startLine ? `-${f.endLine}` : ''}] (${f.severity}/${f.category}) ${truncate(f.title, 100)}`,
    )
    .join('\n');
  return [
    buildSystemPreamble(args.ctx, args.depth, args.lang),
    '',
    '--- PHASE D — PERMUTATION & ALTERNATIVES ---',
    'For each of the following CRITICAL/MAJOR findings, propose at least one alternative implementation that would avoid or mitigate the issue, weighing trade-offs honestly.',
    'Do NOT alternativize the entire diff — focus only on these load-bearing findings. The goal is to give the author actionable options for the things that really matter.',
    'Use category "architecture" or "maintainability". Severity should usually be "minor" (the alternative is advice, not a defect) unless the alternative reveals a SECOND defect.',
    'If a finding\'s current approach is genuinely the best trade-off given the constraints, say so as a "praise"-severity finding that explains why other options are worse — that is also valuable.',
    '',
    '--- FINDINGS TO ALTERNATIVIZE ---',
    focus || '(none — phase D permute should not have been invoked)',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT_FINDINGS_ONLY,
  ].join('\n');
}

// ─── PHASE E — CRITIQUE & SUMMARY ─────────────────────────────────────

