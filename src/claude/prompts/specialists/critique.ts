import { ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';

export function buildCritiquePrompt(args: {
  ctx: ProjectContext;
  depth: ReasoningDepth;
  /**
   * Prior findings serialized as JSON, each tagged with a SHORT id ('f1', 'f2',
   * …). The id field is the key critique must echo back in its decisions array
   * — keep it stable and short so the model doesn't drop or mangle it.
   */
  priorFindingsJson: string;
  diff: string;
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, args.depth, args.lang),
    '',
    '--- PHASE E — SELF-CRITIQUE ---',
    'Below are the consolidated findings from all earlier phases, each tagged with a SHORT id (f1, f2, …). Your job is to harden this list before it reaches the author.',
    '',
    'For EACH prior finding, emit ONE decision object in `decisions[]`, keyed by its id:',
    '  { "id": "f3", "action": "keep" }',
    '  { "id": "f5", "action": "revise", "reason": "...", "revised": { ...full finding shape, see below... } }',
    '  { "id": "f7", "action": "drop",   "reason": "..." }',
    '  { "id": "f9", "action": "merge",  "reason": "...", "mergeIntoId": "f3" }',
    '',
    'Action semantics:',
    '  KEEP   — load-bearing, evidence is strong, severity matches impact. No other fields needed.',
    '  REVISE — refine the wording, severity, or fix; the underlying point stands. `revised` MUST contain the full new finding object (same shape as a normal finding, see the contract). `reason` explains briefly what you changed and why.',
    '  DROP   — not actually a problem, or so weak it would waste the reader\'s time. `reason` explains why this is not load-bearing.',
    '  MERGE  — two findings describe the same symptom from different angles; combine them into the survivor referenced by `mergeIntoId`. `reason` explains the overlap.',
    '',
    'DROP rules (be ruthless — author trust is the scarce resource):',
    '  - DROP if confidence="low" AND severity ∈ {minor, nit}.',
    '  - DROP if the finding is "consider X" without concrete evidence of an actual problem in this diff.',
    '  - DROP if it only restates a coding-style preference a formatter/linter would catch.',
    '  - DROP if the evidence quote does not actually demonstrate the claimed problem.',
    '  - DROP if it speculates about behaviour in code that is not in the diff or in the loaded context.',
    '',
    'MERGE rules:',
    '  - If two findings target the same file:line ± 3 and the same root cause, merge the weaker one INTO the stronger one. Keep the higher severity and the strongest evidence on the survivor.',
    '  - Preserve "Related:" relationships — if a related finding stands on its own, KEEP it as a separate finding with the prefix; do not merge it into its parent.',
    '  - `mergeIntoId` must reference another finding\'s id from the prior set (or a new finding\'s id you create — see below).',
    '',
    'NEW findings (additive — separate from decisions[]):',
    '  - Look especially for hidden assumptions, edge cases (empty/null/huge/concurrent/malformed), subtle correctness bugs, and inconsistencies with project conventions.',
    '  - Emit them in the top-level `findings[]` array (same shape as any specialist pass).',
    '  - If you want a new finding to be the merge survivor for some prior finding, give it a temporary id ("nf1", "nf2", …) on the finding object and reference that id in the prior\'s `mergeIntoId`.',
    '',
    'HARD RULES:',
    '  - EVERY prior id must appear EXACTLY ONCE in `decisions[]`. Missing ids are treated as "drop" with reason="critique omitted decision" (you don\'t want that — emit explicitly).',
    '  - Do NOT echo prior findings into `findings[]`. `findings[]` is ONLY for genuinely new ones critique discovered.',
    '  - mergeIntoId must point to a real id (either another prior id, or a "nfN" id of a new finding you also emit).',
    '',
    '--- PRIOR FINDINGS (JSON, each tagged with an `id` like "f1") ---',
    args.priorFindingsJson,
    '',
    '--- DIFF ---',
    args.diff,
    '',
    'Return ONLY a single JSON object matching this shape (no prose, no fences):',
    '',
    'interface CritiqueOutput {',
    '  decisions: Array<',
    '    | { id: string; action: "keep" }',
    '    | { id: string; action: "drop"; reason: string }',
    '    | { id: string; action: "merge"; reason: string; mergeIntoId: string }',
    '    | { id: string; action: "revise"; reason: string; revised: Finding }',
    '  >;',
    '  findings: Finding[];                // additive — new findings only',
    '  summary?: ReviewSummary;            // optional, ignored if absent',
    '}',
    '',
    'A Finding has the same shape as in the standard contract:',
    '  { id?: string;                    // OPTIONAL for new findings; use "nf1", "nf2", … if referenced by a merge',
    '    file: string;',
    '    startLine: number; endLine: number;',
    '    severity: "critical" | "major" | "minor" | "nit" | "praise";',
    '    category: "bug" | "security" | "performance" | "correctness" | "maintainability"',
    '             | "readability" | "tests" | "docs" | "style" | "architecture"',
    '             | "accessibility" | "concurrency" | "data-integrity" | "api-contract" | "other";',
    '    title: string; description: string; reasoning: string;',
    '    questionsRaised: string[]; alternativesConsidered: string[]; evidence: string[];',
    '    confidence: "high" | "medium" | "low";',
    '    relatedFiles: string[];',
    '    suggestedFix?: { description: string; replacement: string; confidence: "high"|"medium"|"low" };',
    '  }',
    '',
    'File paths and line numbers MUST be real and verifiable in the diff. Never invent code not in the diff or context.',
  ].join('\n');
}
