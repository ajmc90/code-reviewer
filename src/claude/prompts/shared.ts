import { ChangeMapEntry, FindingIndexEntry } from '../../types';
import { Lang } from '../../i18n';

/**
 * Shared block describing a single Finding's shape. Used by both the
 * findings-only contract (specialists) and the full contract (summary pass)
 * so the field requirements stay in sync. Edit here, not in two places.
 */
const FINDING_SHAPE = `Array<{
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
      oldString: string;            // EXACT substring currently in the file. The applier searches for this and replaces it. Must be a verbatim copy from the diff (matching whitespace, quotes, casing). Include enough surrounding lines for the match to be UNIQUE in the file.
      newString: string;            // exact replacement text. Indentation must match what the file expects at that position.
      contextBefore?: string;       // optional 1-3 lines IMMEDIATELY before oldString — only needed when oldString could match more than once in the file (e.g. a common pattern like "return null;"). Used by the applier to disambiguate.
      contextAfter?: string;        // optional 1-3 lines IMMEDIATELY after oldString — same role as contextBefore.
      confidence: "high" | "medium" | "low";
    };
  }>`;

const SUGGESTED_FIX_RULES = `
Hard rules:
- File paths and line numbers MUST be real and verifiable in the provided diff.
- If you cannot precisely locate a problem, lower confidence to "low" and say so in reasoning.
- Never invent code that is not in the diff or in the project context.
- praise findings are allowed but use sparingly and only for things truly worth highlighting.

suggestedFix rules (CRITICAL — fixes are applied via search/replace using oldString → newString. The applier searches the live file for oldString, so it MUST match the current file byte-for-byte):

oldString:
- Copy oldString VERBATIM from the file in the diff. Same indentation (tabs vs spaces), same quote style, same trailing whitespace, same casing, same line endings as the original.
- oldString MUST be UNIQUE in the file. If the offending construct alone could match multiple places (e.g. a generic "return null;" or "} else {"), EXTEND oldString upward/downward to include enough surrounding lines to make it unique — typically a few lines above and below.
- oldString MUST cover a SYNTACTICALLY COMPLETE unit. Never start or end in the middle of a multi-line JSX tag, an open brace, an open parenthesis, a multi-line string, or an expression. If the smallest meaningful unit spans 20 lines, oldString must span those 20 lines.
- oldString MUST cover EVERYTHING that newString is replacing. If newString rewrites a <label>…</label> block, oldString must include the entire <label>…</label> block — not just its opening tag. Failing this is the #1 way fixes corrupt files: the new code gets inserted but the old code survives intact below it.
- Do NOT include diff markers (leading "+"/"-"). Those are in the diff format you're reading, not in the file itself.

newString:
- newString is what oldString gets replaced with. It must be a self-contained, syntactically valid drop-in for the exact span that oldString covers. After substitution, the file must still parse: every tag opened is closed, braces/parens balance, no attributes or fragments from the surrounding code are left orphaned, no unintended sibling elements are deleted.
- newString preserves everything in oldString that wasn't the problem. If oldString contained more than just the offending construct (the wrapping div, sibling lines, etc.), newString must reconstruct that wrapping context faithfully — do NOT silently drop it.
- newString uses the same indentation style and base indent level as oldString, so the resulting file is not visibly malformatted.
- newString is for REPLACING what's in oldString. Never use it to ADD a new construct ALONGSIDE the original (e.g. adding a new button to a form). Additive changes belong in description as prose with suggestedFix omitted.

contextBefore / contextAfter (optional):
- Only set these when oldString might still match more than once even after extending it. Each is 1-3 lines of file content IMMEDIATELY adjacent to oldString (above for contextBefore, below for contextAfter). The applier uses them only as tiebreakers.

When to OMIT suggestedFix entirely:
- The fix needs edits in multiple non-contiguous regions, or in a different file.
- You cannot extract an oldString that is BOTH unique in the file AND covers a syntactically complete unit AND covers everything newString replaces.
- The change is additive (new construct, not a substitution).
A missing suggestedFix is strictly better than one that corrupts the file. Explain the fix in description/reasoning prose instead.

startLine / endLine: still required on the finding itself (they drive the editor decoration and the location shown on the card) — set them to cover the same span as oldString.
`.trim();

/**
 * Findings-only contract used by every pass EXCEPT the final summary pass.
 *
 * Why two contracts: specialists (security, performance, tests, gaps, permute,
 * accessibility) and explore previously had to emit a full `summary` envelope
 * even though the orchestrator only consumes their `findings`. The summary
 * output was discarded — 30-40% of each specialist's output tokens spent on
 * dead content. The summary pass is the only place where summary is consumed
 * (via parser.ts parseClaudeOutput → ReviewSummary), so only summary.ts uses
 * the full JSON_CONTRACT below.
 *
 * The parser is tolerant — it accepts both shapes — so passes that briefly
 * regress to including a summary still work, just at a higher token cost.
 */
export const JSON_CONTRACT_FINDINGS_ONLY = `
You MUST respond with ONLY a single JSON object. No prose, no markdown fences, no preamble.

DO NOT include a "summary" key. The orchestrator already runs a dedicated summary pass at the end; any summary you produce here is discarded and just costs tokens. Emit ONLY the findings array.

The object must match this TypeScript shape exactly:

interface Output {
  findings: ${FINDING_SHAPE};
}

${SUGGESTED_FIX_RULES}
`.trim();

export const JSON_CONTRACT = `
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
      oldString: string;            // EXACT substring currently in the file. The applier searches for this and replaces it. Must be a verbatim copy from the diff (matching whitespace, quotes, casing). Include enough surrounding lines for the match to be UNIQUE in the file.
      newString: string;            // exact replacement text. Indentation must match what the file expects at that position.
      contextBefore?: string;       // optional 1-3 lines IMMEDIATELY before oldString — only needed when oldString could match more than once in the file. Used by the applier to disambiguate.
      contextAfter?: string;        // optional 1-3 lines IMMEDIATELY after oldString — same role as contextBefore.
      confidence: "high" | "medium" | "low";
    };
  }>;
}

${SUGGESTED_FIX_RULES}
`.trim();

/**
 * Anti-duplication block injected into specialists when there are prior
 * findings. The model is instructed to either skip the duplicate or emit it
 * as a "Related:" finding that extends the original.
 */
export function antiDuplicationBlock(priorFindings: FindingIndexEntry[]): string {
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
export function changeMapBlock(changeMap: ChangeMapEntry[]): string {
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

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/**
 * Output-language directive appended to the system preamble. JSON keys MUST
 * stay English (contract); only user-visible string VALUES are translated.
 */
export function languageDirective(lang: Lang): string {
  if (lang === 'es') {
    return [
      '',
      'Output language:',
      '- Write ALL user-visible string VALUES in Spanish (neutral Latin American Spanish). This includes: title, description, reasoning, questionsRaised, alternativesConsidered, evidence, executiveSummary, topConcerns, strengths, suggestedFix.description.',
      '- DO NOT translate JSON KEYS — they are part of the contract and must remain in English.',
      '- DO NOT translate enum values (severity, category, confidence, overallVerdict).',
      '- Inside suggestedFix.oldString and suggestedFix.newString, the value is CODE. Keep the code verbatim; only translate inline comments if present. The same applies to contextBefore/contextAfter.',
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
