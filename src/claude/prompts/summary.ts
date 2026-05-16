import { ChangeMapEntry, Finding, ProjectContext, ReasoningDepth } from '../../types';
import { Lang } from '../../i18n';
import { buildSystemPreamble } from './system';
import { JSON_CONTRACT } from './shared';

export function buildSummaryPrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  allFindingsJson: string;
  diffStat: { filesChanged: number; insertions: number; deletions: number };
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth, args.lang),
    '',
    '--- PHASE E — FINAL SUMMARY ---',
    'You will be given the consolidated findings from earlier phases. Produce ONLY the summary object (no findings).',
    '',
    `Diff stat: ${args.diffStat.filesChanged} files, +${args.diffStat.insertions} / -${args.diffStat.deletions}`,
    '',
    'Consolidated findings:',
    args.allFindingsJson,
    '',
    'Return JSON of this exact shape:',
    `{ "summary": { "overallVerdict": "...", "executiveSummary": "...", "topConcerns": [...], "strengths": [...], "riskScore": 0 }, "findings": [] }`,
    '',
    'No prose outside the JSON.',
  ].join('\n');
}

// ─── PHASE A.0 — STRUCTURAL EXPLORATION (unchanged) ───────────────────

