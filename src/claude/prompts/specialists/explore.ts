import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT } from '../shared';

// ─── PHASE A — DISCOVERY ──────────────────────────────────────────────

export function buildExplorePrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  baseBranch: string;
  headBranch: string;
  diff: string;
  conventions: string;
  changedFiles: DiffFile[];
  extraContext?: string;
  structuralRisks?: string[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth, args.lang),
    '',
    `Base branch: ${args.baseBranch}`,
    `Head branch: ${args.headBranch}`,
    `Files changed: ${args.changedFiles.length}`,
    '',
    args.structuralRisks && args.structuralRisks.length
      ? '--- HINTS FROM STRUCTURAL EXPLORATION (consider these when reviewing) ---\n' +
        args.structuralRisks.map((r) => '- ' + r).join('\n') +
        '\n'
      : '',
    args.extraContext || '',
    '--- PROJECT CONVENTIONS (excerpts from CLAUDE.md / README / contributing docs) ---',
    args.conventions || '(none provided)',
    '',
    '--- UNIFIED DIFF (base...head) ---',
    args.diff,
    '',
    '--- TASK: PHASE A — DISCOVERY & EXPLORATION ---',
    'You are the first reviewer to see this branch. Your job has TWO parts:',
    '',
    'PART 1 — Build a mental model. For each changed file, classify what kind of change it is and how far its effects reach. This map will be passed to every later pass so they can focus.',
    '',
    'PART 2 — Walk every changed file and surface findings about correctness, bugs, regressions and missing edge cases. Do NOT focus on style/perf/security/a11y yet — those are dedicated later passes; only flag them here if they are blatant and you would feel bad letting them through.',
    '',
    'Respond with a SINGLE JSON object of this exact shape (no prose, no fences):',
    '',
    '{',
    '  "changeMap": [',
    '    { "file": "src/foo.ts", "kind": "new-feature", "blastRadius": "module", "note": "adds public Foo API used by bar" },',
    '    { "file": "src/bar.ts", "kind": "refactor",    "blastRadius": "local" }',
    '  ],',
    '  "summary": { "overallVerdict": "...", "executiveSummary": "...", "topConcerns": [...], "strengths": [...], "riskScore": 0 },',
    '  "findings": [ ... as in the standard contract ... ]',
    '}',
    '',
    'changeMap rules:',
    '- kind ∈ "new-feature" | "refactor" | "bugfix" | "migration" | "config" | "deps" | "test" | "docs" | "style" | "other"',
    '- blastRadius ∈ "local" (only this file) | "module" (this file + siblings/callers in same area) | "cross-cutting" (touches many unrelated areas, e.g. utility used everywhere)',
    '- One entry per changed file. note is optional (≤ 90 chars).',
    '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildStructuralExplorationPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  changedFiles: DiffFile[];
  conventions: string;
}): string {
  const filesList = args.changedFiles.slice(0, 60).map((f) => `- ${f.path}`).join('\n');
  return [
    'You are a code-review preparation agent. Your job is NOT to review yet — instead, you decide WHICH files outside the diff you would need to read in order to do a thorough review of this branch.',
    '',
    `Project root: ${args.ctx.rootPath}`,
    `Languages: ${args.ctx.language.join(', ') || 'unknown'}`,
    `Frameworks: ${args.ctx.frameworks.join(', ') || 'unknown'}`,
    '',
    '--- CHANGED FILES ---',
    filesList,
    '',
    '--- PROJECT CONVENTIONS ---',
    args.conventions || '(none provided)',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    'Identify and use the Read / Grep tools available to you to inspect:',
    '1. Callers of any function/class added or modified (grep for the symbol).',
    '2. Test files that exercise the changed code paths.',
    '3. Type/interface definitions referenced but not shown.',
    '4. Sibling files in the same module that establish convention.',
    '5. Files whose behavior depends on contracts the diff might have broken.',
    '',
    'Be parsimonious — pick the 5-15 most load-bearing files only, not everything. After exploring, RESPOND with a JSON object of this exact shape (no prose):',
    '',
    '{',
    '  "filesToInclude": [',
    '    { "path": "src/foo.ts", "reason": "defines the Foo type extended by the diff", "lines": null },',
    '    { "path": "tests/foo.test.ts", "reason": "exercises the function that was modified", "lines": "1-80" }',
    '  ],',
    '  "observedRisks": [',
    '    "Caller src/bar.ts:42 passes a now-removed property",',
    '    "No tests cover the new error branch in src/baz.ts:88"',
    '  ]',
    '}',
    '',
    'lines is optional. If you set it, only that range is included as context. observedRisks is a free-text checklist of concerns you discovered while exploring — they will be passed to the next pass as hints.',
  ].join('\n');
}

