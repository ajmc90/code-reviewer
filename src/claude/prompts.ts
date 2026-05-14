import { DiffFile, ProjectContext, ReasoningDepth } from '../types';

const JSON_CONTRACT = `
You MUST respond with ONLY a single JSON object. No prose, no markdown fences, no preamble.

The object must match this TypeScript shape exactly:

interface Output {
  summary: {
    overallVerdict: "block" | "needs-changes" | "approve-with-comments" | "approve" | "praise";
    executiveSummary: string;       // 3-6 sentences, what this branch does and the big picture
    topConcerns: string[];          // 0-8 short bullets, the things a senior would say first
    strengths: string[];            // 0-5 short bullets, what is genuinely well done
    riskScore: number;              // 0-100, higher = riskier to merge
  };
  findings: Array<{
    file: string;                   // repo-relative path, MUST match a file in the diff
    startLine: number;              // 1-indexed line in the NEW (head) version of the file
    endLine: number;                // inclusive, 1-indexed
    severity: "critical" | "major" | "minor" | "nit" | "praise";
    category: "bug" | "security" | "performance" | "correctness" | "maintainability"
            | "readability" | "tests" | "docs" | "style" | "architecture"
            | "accessibility" | "concurrency" | "data-integrity" | "api-contract" | "other";
    title: string;                  // <= 90 chars, imperative-ish
    description: string;            // 1-4 sentences, plain
    reasoning: string;              // WHY this is a problem. Show your work.
    questionsRaised: string[];      // questions you asked yourself while reviewing this spot
    alternativesConsidered: string[]; // other ways this could be written, with trade-offs
    evidence: string[];             // direct quotes/snippets from the diff that prove the point
    confidence: "high" | "medium" | "low";
    relatedFiles: string[];         // other files that should be checked together
    suggestedFix?: {
      description: string;
      replacement: string;          // the exact text to put in place of the cited range
      confidence: "high" | "medium" | "low";
    };
  }>;
}

Hard rules:
- File paths and line numbers MUST be real and verifiable in the provided diff.
- If you cannot precisely locate a problem, lower confidence to "low" and say so in reasoning.
- Never invent code that is not in the diff or in the project context.
- praise findings are allowed but use sparingly and only for things truly worth highlighting.
`.trim();

export function buildSystemPreamble(ctx: ProjectContext, depth: ReasoningDepth): string {
  const depthInstructions: Record<ReasoningDepth, string> = {
    fast: 'Skim for clear bugs and obvious problems. Skip nits.',
    balanced:
      'Read carefully. Cover correctness, security and tests. Surface 2-3 alternatives only when they materially change the design.',
    deep:
      'Read every changed line. For each non-trivial change ask: what could go wrong, what is the author assuming, what would break this. Propose alternatives when the chosen approach has a real downside.',
    obsessive:
      'Be relentless. For every change, enumerate at least three failure modes and at least two alternative implementations with trade-offs. Self-critique: re-read your own findings and remove anything that is not load-bearing. Question every assumption — about types, lifetimes, ordering, concurrency, error paths, and operator behaviour. Permute inputs (empty, null, huge, malformed, concurrent) until you find what breaks.',
  };

  return [
    'You are a senior staff engineer doing a careful code review of a git branch.',
    '',
    'Project context:',
    `- root: ${ctx.rootPath}`,
    `- languages: ${ctx.language.join(', ') || 'unknown'}`,
    `- frameworks: ${ctx.frameworks.join(', ') || 'unknown'}`,
    `- test frameworks: ${ctx.testFrameworks.join(', ') || 'unknown'}`,
    `- monorepo: ${ctx.monorepo}`,
    `- has CLAUDE.md: ${ctx.hasCLAUDEmd}`,
    '',
    `Reasoning depth: ${depth}.`,
    depthInstructions[depth],
    '',
    'Style of feedback:',
    '- Lead with the WHY. The reader should learn something from each comment, not just receive a directive.',
    '- Pin every comment to a specific file and line range from the diff.',
    "- When you propose a fix, give exact replacement code that will compile in the project's language.",
    '- Distinguish must-fix from nice-to-have via severity.',
    '- Acknowledge trade-offs honestly. If your suggestion has a downside, say so.',
    '- Do not nitpick formatting that a formatter would handle.',
    '- Do not invent. If you are not sure, lower confidence and say what you would need to verify.',
  ].join('\n');
}

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
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth),
    '',
    `Base branch: ${args.baseBranch}`,
    `Head branch: ${args.headBranch}`,
    `Files changed: ${args.changedFiles.length}`,
    '',
    args.structuralRisks && args.structuralRisks.length
      ? '--- HINTS FROM STRUCTURAL EXPLORATION (consider these when reviewing) ---\n' +
        args.structuralRisks.map((r) => '- ' + r).join('\n') + '\n'
      : '',
    args.extraContext || '',
    '--- PROJECT CONVENTIONS (excerpts from CLAUDE.md / README / contributing docs) ---',
    args.conventions || '(none provided)',
    '',
    '--- UNIFIED DIFF (base...head) ---',
    args.diff,
    '',
    '--- TASK: PASS 1 — EXPLORATION ---',
    "First, build a mental model of what this branch does. Then walk every changed file. Surface findings about correctness, bugs, regressions and missing edge cases. Don't worry yet about style or perf — those are later passes.",
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildCritiquePrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  priorFindingsJson: string;
  diff: string;
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth),
    '',
    '--- PASS 2 — SELF-CRITIQUE ---',
    'Below are findings from pass 1. Your job is to challenge them.',
    'For each finding decide:',
    '  - KEEP (still load-bearing, evidence is strong)',
    '  - REVISE (refine wording, severity, or fix)',
    '  - DROP (not actually a problem, or duplicate)',
    '',
    'Also: add any findings that pass 1 missed. Look especially for:',
    '  - Hidden assumptions in the diff',
    '  - Edge cases (empty input, null, huge, concurrent, malformed)',
    '  - Subtle correctness bugs the author would not have noticed',
    '  - Inconsistencies with the project conventions',
    '',
    '--- PRIOR FINDINGS (JSON) ---',
    args.priorFindingsJson,
    '',
    '--- DIFF ---',
    args.diff,
    '',
    'Return the FULL updated set (kept + revised + new), not a diff. Drop anything you decide is not load-bearing.',
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildPermutePrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  diff: string;
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth),
    '',
    '--- PASS 3 — PERMUTATION & ALTERNATIVES ---',
    'For each non-trivial change in the diff, produce findings that propose at least one alternative implementation, weighing trade-offs honestly.',
    'Use category "architecture" or "maintainability". Severity should usually be "minor" unless the alternative is clearly better.',
    'If the current approach is genuinely the best choice, do not invent an alternative — produce a "praise" finding instead.',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildSecurityPrompt(args: { ctx: ProjectContext; diff: string }): string {
  return [
    buildSystemPreamble(args.ctx, 'deep'),
    '',
    '--- SECURITY PASS ---',
    'Audit ONLY for security concerns: injection (SQL, command, prompt), XSS, SSRF, path traversal, broken auth/authz, secret leakage, unsafe deserialization, weak crypto, missing input validation at trust boundaries, supply-chain risk in new dependencies, race conditions with security impact, insecure defaults.',
    'If there are no real security issues, return findings: [] and say so in the summary.',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildPerformancePrompt(args: { ctx: ProjectContext; diff: string }): string {
  return [
    buildSystemPreamble(args.ctx, 'deep'),
    '',
    '--- PERFORMANCE PASS ---',
    'Audit ONLY for performance concerns: hot-loop inefficiencies, N+1 queries, repeated work, unnecessary allocations, blocking I/O on hot paths, missing indexes, cache-busting patterns, accidental quadratic behaviour, large synchronous work in async contexts.',
    'Be honest about whether the perf concern is real for THIS code path (estimate frequency / data size).',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildAccessibilityPrompt(args: { ctx: ProjectContext; diff: string; uiFiles: string[] }): string {
  return [
    buildSystemPreamble(args.ctx, 'deep'),
    '',
    '--- ACCESSIBILITY PASS ---',
    'Audit ONLY for accessibility (a11y) concerns. Focus on the UI files touched in the diff:',
    `${args.uiFiles.length} UI files in this diff: ${args.uiFiles.slice(0, 30).join(', ')}${args.uiFiles.length > 30 ? '…' : ''}`,
    '',
    'Check for:',
    '- Color contrast: text on backgrounds, focus rings, severity indicators. Estimate WCAG AA (4.5:1 body, 3:1 large/UI) when colors are visible in the diff.',
    '- Information conveyed only by color (must have an icon/text/border companion).',
    '- Missing semantic HTML: <button> vs clickable <div>, headings hierarchy, landmark roles, lists.',
    '- Missing ARIA: aria-label on icon-only buttons, aria-expanded on disclosures, aria-live on dynamic regions, role on custom widgets.',
    '- Keyboard: tabindex, focus visible, focus management on modals/dialogs, Escape to close, Enter/Space to activate.',
    '- Images / icons: missing alt text, decorative images without alt="", SVGs without title or aria-hidden.',
    '- Form fields: missing <label>, missing association via for/id, missing required/invalid states for SR.',
    '- Touch targets: tap targets under 44x44 logical px on mobile flows.',
    '- Motion: animations without prefers-reduced-motion fallback; auto-playing media.',
    '- Time-based content: countdowns/toasts that disappear without a way to pause/extend.',
    '- Internationalization signals: lang attribute, dir for RTL, hard-coded English strings if i18n is detected.',
    '',
    'Use category "accessibility" for findings. Severity guide:',
    '- critical: blocks users with assistive tech entirely (clickable div with no keyboard support)',
    '- major: violates WCAG AA (contrast fail, missing label on form input)',
    '- minor: WCAG AAA / nice-to-have (no skip link, animation without reduce-motion)',
    '- praise: when something is done unusually well (e.g. proper focus trap)',
    '',
    'If the diff has no UI/CSS/markup changes, return findings: [].',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildGapsPrompt(args: { ctx: ProjectContext; diff: string; conventions: string; changedFiles: DiffFile[] }): string {
  const fileSummary = args.changedFiles.slice(0, 60).map((f) => `${f.status[0].toUpperCase()} ${f.path}`).join('\n');
  return [
    buildSystemPreamble(args.ctx, 'deep'),
    '',
    '--- GAPS PASS ---',
    'Audit ONLY for what is MISSING — things the author probably should have touched but did not. This is the "complete the picture" lens.',
    '',
    'For every meaningful change, ask:',
    '- Did they add a new endpoint / API method? Then: client/SDK regenerated? OpenAPI spec updated? Postman / fixtures? Auth/permissions enforced? Rate limit applied?',
    '- Did they add a new database column / migration? Then: backfill plan? rollback migration? ORM models updated? read paths updated? indexes considered?',
    '- Did they add a new UI component? Then: storybook story? unit/snapshot test? a11y check? translations? loading / error / empty states?',
    '- Did they add a new env var or config flag? Then: documented in README? .env.example? deployment manifests / CI secrets? feature-flag rollout plan?',
    '- Did they add a new dependency? Then: license compatible? bundle-size impact? maintained? CVEs? lock file committed?',
    '- Did they change error handling? Then: logging / telemetry / metrics for the new path? user-facing message? retry/backoff?',
    '- Did they rename / move something? Then: callers updated everywhere (grep!)? docs updated? changelog?',
    '- Did they add async work or a worker? Then: timeout? cancellation? idempotency? observability (trace span, metric)?',
    '- Did they delete code? Then: dead-code search? feature-flag cleanup? telemetry events that referenced it?',
    '- Did they touch auth flow? Then: logout/expiry path also updated? audit log?',
    '',
    'Lean on project context: if the project clearly has tests but the diff has no tests, that is a gap. If CLAUDE.md mentions a pattern that this change ignores, that is a gap.',
    '',
    '--- DIFF FILE SUMMARY ---',
    fileSummary,
    '',
    '--- PROJECT CONVENTIONS ---',
    args.conventions || '(none provided)',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    'For each gap, produce a finding anchored to the most relevant changed file + line (the place where the missing piece SHOULD have been added or referenced). If you cannot anchor precisely, anchor to line 1 of the file most central to the change and lower confidence to "low".',
    'Use category "other" unless one of these fits better: "tests", "docs", "api-contract", "data-integrity", "architecture", "accessibility".',
    'If nothing is genuinely missing, return findings: [].',
    '',
    JSON_CONTRACT,
  ].join('\n');
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

export function buildContextSection(extraFiles: Array<{ path: string; content: string; reason?: string }>): string {
  if (extraFiles.length === 0) return '';
  const parts = ['--- EXTRA FILE CONTEXT (full content of related files) ---'];
  for (const f of extraFiles) {
    parts.push('');
    parts.push(`### ${f.path}${f.reason ? `  (${f.reason})` : ''}`);
    parts.push('```');
    parts.push(f.content);
    parts.push('```');
  }
  return parts.join('\n');
}

export function buildTestsPrompt(args: { ctx: ProjectContext; diff: string }): string {
  return [
    buildSystemPreamble(args.ctx, 'deep'),
    '',
    '--- TESTS PASS ---',
    'Audit ONLY for test coverage and quality: missing tests for new logic, tests that assert on implementation details, tests that would still pass if the code under test were deleted, flaky patterns (sleeps, real time, real network), missing edge cases, fixtures that hide bugs.',
    'If there are genuinely no test concerns, return findings: [].',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ].join('\n');
}

export function buildSummaryPrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  allFindingsJson: string;
  diffStat: { filesChanged: number; insertions: number; deletions: number };
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth),
    '',
    '--- FINAL SUMMARY PASS ---',
    'You will be given the consolidated findings from earlier passes. Produce ONLY the summary object (no findings).',
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
