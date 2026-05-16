import { ChangeMapEntry, FindingIndexEntry } from '../../types';
import { Lang } from '../../i18n';

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
