import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../types';
import { Lang } from '../i18n';

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
    title: string;                  // <= 90 chars, imperative-ish. Prefix with "Related: " if it extends a prior finding.
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

suggestedFix rules (CRITICAL — fixes are applied verbatim by replacing lines [startLine..endLine] with replacement):
- startLine/endLine MUST cover a SYNTACTICALLY COMPLETE unit. Never end the range in the middle of an expression, a multi-line JSX tag, an open brace, an open parenthesis, or a multi-line string. If the smallest meaningful unit spans 20 lines, the range must span 20 lines — do NOT cite only the first or last line.
- replacement MUST be a self-contained, syntactically valid drop-in for that exact range. After substitution, the file must still parse: every tag opened in the replacement is closed in the replacement, every brace/paren balances, no attributes or fragments from the surrounding code are left orphaned, no unintended sibling elements are deleted.
- replacement preserves everything outside the cited range. If the original range contained more than just the offending construct (e.g. you are fixing the <input> inside a <div className="field">…</div>, and your range includes the wrapping div), the replacement must reconstruct the wrapping context faithfully, NOT silently drop it.
- replacement uses the same indentation style and base indent level as the lines being replaced, so the resulting file is not visibly malformatted.
- If you cannot produce a replacement that satisfies these rules (e.g. the right fix needs edits in multiple non-contiguous regions, or in a different file), OMIT suggestedFix entirely and explain the fix in description/reasoning instead. A missing suggestedFix is strictly better than one that corrupts the file.
- Never use suggestedFix to ADD a new construct alongside the original (e.g. adding a submit button to a form). suggestedFix is for REPLACING the cited range. Additive changes belong in description as prose.
`.trim();

/**
 * Anti-duplication block injected into specialists when there are prior
 * findings. The model is instructed to either skip the duplicate or emit it
 * as a "Related:" finding that extends the original.
 */
function antiDuplicationBlock(priorFindings: FindingIndexEntry[]): string {
  if (priorFindings.length === 0) return '';
  const lines = priorFindings
    .slice(0, 80)
    .map(
      (f) =>
        `- [${f.file}:${f.startLine}${f.endLine !== f.startLine ? `-${f.endLine}` : ''}] (${f.severity}/${f.category}) ${truncate(f.title, 90)}`,
    );
  return [
    '--- PRIOR FINDINGS ALREADY REPORTED (do NOT duplicate) ---',
    'Earlier passes have already produced these findings. Rules:',
    '  1. If your finding is the SAME issue (same file ± 3 lines AND same root cause), DO NOT emit it again.',
    '  2. If your finding is a RELATED but distinct angle (e.g. tests pass missed an edge case that perf pass would also flag for a different reason), prefix the title with "Related: " and reference the prior file:line in your reasoning.',
    '  3. If your finding contradicts a prior one (you think it is wrong), still emit yours and explain the disagreement in reasoning — the critique pass will reconcile.',
    '',
    'Prior findings:',
    ...lines,
    priorFindings.length > 80 ? `- … (${priorFindings.length - 80} more omitted)` : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * ChangeMap block: tells the specialist what kind of change each file
 * represents so it can focus (e.g. security mostly cares about new-feature +
 * config + deps + migration, not docs/style/test).
 */
function changeMapBlock(changeMap: ChangeMapEntry[]): string {
  if (changeMap.length === 0) return '';
  const lines = changeMap
    .slice(0, 80)
    .map((c) => `- ${c.file} · ${c.kind} · ${c.blastRadius}${c.note ? ` — ${c.note}` : ''}`);
  return [
    '--- CHANGE MAP (per-file classification from explore pass) ---',
    'Use this to focus your attention. Skip files whose "kind" is clearly outside your concern.',
    ...lines,
    changeMap.length > 80 ? `- … (${changeMap.length - 80} more omitted)` : '',
    '',
  ].join('\n');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/**
 * Output-language directive appended to the system preamble. JSON keys MUST
 * stay English (contract); only user-visible string VALUES are translated.
 */
function languageDirective(lang: Lang): string {
  if (lang === 'es') {
    return [
      '',
      'Output language:',
      '- Write ALL user-visible string VALUES in Spanish (neutral Latin American Spanish). This includes: title, description, reasoning, questionsRaised, alternativesConsidered, evidence, executiveSummary, topConcerns, strengths, suggestedFix.description.',
      '- DO NOT translate JSON KEYS — they are part of the contract and must remain in English.',
      '- DO NOT translate enum values (severity, category, confidence, overallVerdict).',
      '- Inside suggestedFix.replacement, the value is CODE. Keep the code verbatim; only translate inline comments if present.',
      '- Evidence items are quoted diff snippets — keep them verbatim, do NOT translate code.',
      '- The "Related: " prefix in titles stays in English (it is a marker, not prose).',
    ].join('\n');
  }
  // en — explicit so future locales don't accidentally inherit Spanish.
  return [
    '',
    'Output language:',
    '- Write all user-visible string values in English.',
    '- JSON keys stay English (always).',
  ].join('\n');
}

export function buildSystemPreamble(ctx: ProjectContext, depth: ReasoningDepth, lang: Lang = 'en'): string {
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
    languageDirective(lang),
  ].join('\n');
}

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

// ─── PHASE B — SPECIALISTS ────────────────────────────────────────────

export function buildSecurityPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE B — SECURITY PASS ---',
    'Audit ONLY for security concerns: injection (SQL, command, prompt), XSS, SSRF, path traversal, broken auth/authz, secret leakage, unsafe deserialization, weak crypto, missing input validation at trust boundaries, supply-chain risk in new dependencies, race conditions with security impact, insecure defaults.',
    'Focus on files where kind ∈ {new-feature, config, deps, migration} or blastRadius ∈ {module, cross-cutting}. You can skim/skip docs/style/test files unless they reveal a credential.',
    'If there are no real security issues, return findings: [] and say so in the summary.',
    '',
    changeMapBlock(args.changeMap),
    antiDuplicationBlock(args.priorFindings),
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPerformancePrompt(args: {
  ctx: ProjectContext;
  diff: string;
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE B — PERFORMANCE PASS ---',
    'Audit ONLY for performance concerns: hot-loop inefficiencies, N+1 queries, repeated work, unnecessary allocations, blocking I/O on hot paths, missing indexes, cache-busting patterns, accidental quadratic behaviour, large synchronous work in async contexts.',
    'Be honest about whether the perf concern is real for THIS code path (estimate frequency / data size). Files marked kind=docs/style/test are usually not worth flagging unless the cost is obvious.',
    '',
    changeMapBlock(args.changeMap),
    antiDuplicationBlock(args.priorFindings),
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAccessibilityPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  uiFiles: string[];
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE B — ACCESSIBILITY PASS ---',
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
    changeMapBlock(args.changeMap),
    antiDuplicationBlock(args.priorFindings),
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTestsPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE B — TESTS PASS ---',
    'Audit ONLY for test coverage and quality: missing tests for new logic, tests that assert on implementation details, tests that would still pass if the code under test were deleted, flaky patterns (sleeps, real time, real network), missing edge cases, fixtures that hide bugs.',
    'Anchor findings to the file that SHOULD have a test (the source file), not to a hypothetical test file that does not exist.',
    'If there are genuinely no test concerns, return findings: [].',
    '',
    changeMapBlock(args.changeMap),
    antiDuplicationBlock(args.priorFindings),
    '--- DIFF ---',
    args.diff,
    '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── PHASE D — COMPLETENESS & ALTERNATIVES ────────────────────────────

export function buildGapsPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  conventions: string;
  changedFiles: DiffFile[];
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  const fileSummary = args.changedFiles
    .slice(0, 60)
    .map((f) => `${f.status[0].toUpperCase()} ${f.path}`)
    .join('\n');
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE D — GAPS (what is MISSING) ---',
    'Audit ONLY for what is MISSING — things the author probably should have touched but did not. This is the "complete the picture" lens.',
    '',
    'You will see prior findings below. Your job is to find what is missing BEYOND those — do not re-report a missing test/doc/migration that another pass already flagged. Anything you emit here should be net-new.',
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
    changeMapBlock(args.changeMap),
    antiDuplicationBlock(args.priorFindings),
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
    'If nothing is genuinely missing beyond what prior passes caught, return findings: [].',
    '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n');
}

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
    JSON_CONTRACT,
  ].join('\n');
}

// ─── PHASE E — CRITIQUE & SUMMARY ─────────────────────────────────────

export function buildCritiquePrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  priorFindingsJson: string;
  diff: string;
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth, args.lang),
    '',
    '--- PHASE E — SELF-CRITIQUE ---',
    'Below are the consolidated findings from all earlier phases. Your job is to harden this list before it reaches the author.',
    '',
    'For EACH finding decide:',
    '  KEEP   — load-bearing, evidence is strong, severity matches impact.',
    '  REVISE — refine the wording, severity, or fix; the underlying point stands.',
    '  DROP   — not actually a problem, or so weak it would waste the reader\'s time.',
    '  MERGE  — two findings describe the same symptom from different angles; combine them.',
    '',
    'DROP rules (be ruthless — author trust is the scarce resource):',
    '  - DROP if confidence="low" AND severity ∈ {minor, nit}.',
    '  - DROP if the finding is "consider X" without concrete evidence of an actual problem in this diff.',
    '  - DROP if it only restates a coding-style preference a formatter/linter would catch.',
    '  - DROP if the evidence quote does not actually demonstrate the claimed problem.',
    '  - DROP if it speculates about behaviour in code that is not in the diff or in the loaded context.',
    '',
    'MERGE rules:',
    '  - If two findings target the same file:line ± 3 and the same root cause, merge into one. Keep the higher severity and the strongest evidence.',
    '  - Preserve "Related:" relationships — if a related finding stands on its own, keep it as a separate finding with the prefix; do not merge it into its parent.',
    '',
    'Also: add any NEW findings that all earlier passes missed. Look especially for:',
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
    'Return the FULL updated set (kept + revised + new + merged), not a diff. Drop anything that does not pass the DROP rules above.',
    '',
    JSON_CONTRACT,
  ].join('\n');
}

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

// ─── Helpers exported for orchestrator use ────────────────────────────

/**
 * Build the compact FindingIndexEntry list passed to specialists / gaps /
 * permute so the model can avoid duplicating prior work. Excludes praise
 * findings (no value in telling specialists "don't duplicate this praise").
 */
export function toFindingIndex(
  findings: Array<{
    file: string;
    range: { startLine: number; endLine: number };
    severity: FindingIndexEntry['severity'];
    category: FindingIndexEntry['category'];
    title: string;
    pass: FindingIndexEntry['pass'];
  }>,
): FindingIndexEntry[] {
  return findings
    .filter((f) => f.severity !== 'praise')
    .map((f) => ({
      file: f.file,
      startLine: f.range.startLine,
      endLine: f.range.endLine,
      severity: f.severity,
      category: f.category,
      title: f.title,
      pass: f.pass,
    }));
}
