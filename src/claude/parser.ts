import { BlastRadius, ChangeKind, ChangeMapEntry, Finding, ReviewSummary, Severity, Category } from '../types';
import { Lang } from '../i18n';

interface RawOutput {
  summary?: Partial<ReviewSummary>;
  findings?: any[];
  changeMap?: any[];
}

const VALID_CHANGE_KIND: ChangeKind[] = [
  'new-feature',
  'refactor',
  'bugfix',
  'migration',
  'config',
  'deps',
  'test',
  'docs',
  'style',
  'other',
];
const VALID_BLAST_RADIUS: BlastRadius[] = ['local', 'module', 'cross-cutting'];

/**
 * Robust JSON extractor.
 *
 * Claude's responses sometimes include:
 *   - markdown ```json fences
 *   - a leading sentence ("Here's the review:")
 *   - inline example snippets that look like JSON but aren't the answer
 *
 * Strategy:
 *   1. If a ```json (or ```) fenced block exists, use its content.
 *   2. Otherwise scan for ALL balanced top-level {...} objects and pick the
 *      one most likely to be a review payload (has "findings" or "summary").
 *   3. Fallback to first-{ to last-} as a last resort.
 */
export function extractJson(text: string): string | null {
  // 1) Fenced block (prefer ```json over plain ```)
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) return fencedJson[1].trim();
  const fenced = text.match(/```\s*([\s\S]*?)```/);
  if (fenced && /[{}]/.test(fenced[1])) return fenced[1].trim();

  // 2) Balanced top-level objects
  const objects = extractBalancedObjects(text);
  if (objects.length > 0) {
    // prefer the one that looks like our payload
    const scored = objects
      .map((s) => ({ s, score: scoreReviewLikelihood(s) }))
      .sort((a, b) => b.score - a.score || b.s.length - a.s.length);
    if (scored[0].score > 0) return scored[0].s;
    // no good match — return the longest balanced object
    return objects.sort((a, b) => b.length - a.length)[0];
  }

  // 3) Last resort
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function scoreReviewLikelihood(s: string): number {
  let score = 0;
  if (/"findings"\s*:/.test(s)) score += 10;
  if (/"summary"\s*:/.test(s)) score += 10;
  if (/"overallVerdict"\s*:/.test(s)) score += 5;
  if (/"severity"\s*:/.test(s)) score += 3;
  if (/"filesToInclude"\s*:/.test(s)) score += 10; // structural exploration
  if (/"observedRisks"\s*:/.test(s)) score += 5;
  return score;
}

/**
 * Walks the string and returns every top-level balanced {...} substring.
 * Skips braces inside string literals.
 */
function extractBalancedObjects(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue; }
    const start = i;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = false; continue; }
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          i++;
          break;
        }
      }
    }
    if (depth !== 0) break; // unterminated; bail
  }
  return out;
}

export function parseClaudeOutput(
  text: string,
  lang: Lang = 'en',
): { summary?: ReviewSummary; findings: Finding[]; changeMap?: ChangeMapEntry[] } {
  const jsonStr = extractJson(text);
  if (!jsonStr) {
    return { findings: [] };
  }
  let raw: RawOutput;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    // attempt a soft-repair: trim trailing commas, fix smart quotes
    const repaired = jsonStr
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    try {
      raw = JSON.parse(repaired);
    } catch {
      return { findings: [] };
    }
  }

  const findings: Finding[] = (raw.findings ?? [])
    .map((f, i) => normalizeFinding(f, i, lang))
    .filter((f): f is Finding => f !== null);

  let summary: ReviewSummary | undefined;
  if (raw.summary) {
    summary = {
      branch: '',
      baseBranch: '',
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      overallVerdict: normalizeVerdict(raw.summary.overallVerdict),
      executiveSummary: raw.summary.executiveSummary ?? '',
      topConcerns: Array.isArray(raw.summary.topConcerns) ? raw.summary.topConcerns : [],
      strengths: Array.isArray(raw.summary.strengths) ? raw.summary.strengths : [],
      riskScore: typeof raw.summary.riskScore === 'number' ? raw.summary.riskScore : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  let changeMap: ChangeMapEntry[] | undefined;
  if (Array.isArray(raw.changeMap)) {
    changeMap = raw.changeMap
      .map(normalizeChangeMapEntry)
      .filter((e): e is ChangeMapEntry => e !== null);
  }

  return { summary, findings, changeMap };
}

function normalizeChangeMapEntry(e: any): ChangeMapEntry | null {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.file !== 'string' || !e.file) return null;
  const kind: ChangeKind = VALID_CHANGE_KIND.includes(e.kind) ? e.kind : 'other';
  const blastRadius: BlastRadius = VALID_BLAST_RADIUS.includes(e.blastRadius) ? e.blastRadius : 'local';
  const note = typeof e.note === 'string' && e.note.trim() ? String(e.note).slice(0, 200) : undefined;
  return { file: e.file, kind, blastRadius, note };
}

const VALID_VERDICTS: ReviewSummary['overallVerdict'][] = [
  'block',
  'needs-changes',
  'approve-with-comments',
  'approve',
  'praise',
];

/**
 * Coerce whatever the LLM put in overallVerdict into one of the enum values
 * the rest of the system expects. Without this, models occasionally write
 * the verdict as a full sentence ("DO NOT MERGE. THIS BRANCH IS...") and the
 * UI ends up rendering that giant string as a verdict badge — overflowing
 * the card and breaking the layout of the sidebar summary view.
 *
 * Heuristic: exact-match preferred; if not, infer from keywords; default
 * conservative to 'needs-changes' for unknown content (better than the
 * previous 'approve-with-comments' default — if the model produced
 * gibberish we don't want to mislead the user toward approval).
 */
export function normalizeVerdict(raw: unknown): ReviewSummary['overallVerdict'] {
  if (typeof raw !== 'string') return 'approve-with-comments';
  const lowered = raw.toLowerCase().trim();
  if ((VALID_VERDICTS as string[]).includes(lowered)) {
    return lowered as ReviewSummary['overallVerdict'];
  }
  // Keyword-based inference for the common "model wrote a sentence" case.
  // Order matters: check 'do not merge' / 'block' before 'merge', etc.
  if (/\b(do not merge|do\s*n.?t merge|block|reject)\b/.test(lowered)) return 'block';
  if (/\b(needs changes|request changes|request[-_]changes|changes required)\b/.test(lowered)) return 'needs-changes';
  if (/\b(approve with comments|approve[-_]with[-_]comments|approved? with)\b/.test(lowered)) return 'approve-with-comments';
  if (/\b(approve|approved|lgtm|ship it)\b/.test(lowered)) return 'approve';
  if (/\b(praise|excellent|outstanding)\b/.test(lowered)) return 'praise';
  return 'needs-changes';
}

const VALID_SEVERITY: Severity[] = ['critical', 'major', 'minor', 'nit', 'praise'];
const VALID_CATEGORY: Category[] = [
  'bug',
  'security',
  'performance',
  'correctness',
  'maintainability',
  'readability',
  'tests',
  'docs',
  'style',
  'architecture',
  'accessibility',
  'concurrency',
  'data-integrity',
  'api-contract',
  'other',
];

function normalizeFinding(f: any, idx: number, lang: Lang): Finding | null {
  if (!f || typeof f !== 'object') return null;
  if (typeof f.file !== 'string' || !f.file) return null;
  const startLine = Math.max(1, parseInt(f.startLine, 10) || 1);
  const endLine = Math.max(startLine, parseInt(f.endLine, 10) || startLine);
  const severity: Severity = VALID_SEVERITY.includes(f.severity) ? f.severity : 'minor';
  const category: Category = VALID_CATEGORY.includes(f.category) ? f.category : 'other';

  return {
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
    file: f.file,
    range: { startLine, endLine },
    severity,
    category,
    title: String(f.title ?? 'Untitled finding').slice(0, 200),
    description: String(f.description ?? ''),
    reasoning: String(f.reasoning ?? ''),
    questionsRaised: arr(f.questionsRaised),
    alternativesConsidered: arr(f.alternativesConsidered),
    evidence: arr(f.evidence),
    relatedFiles: arr(f.relatedFiles),
    confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium',
    pass: 'explore',
    originalLang: lang,
    suggestedFix: f.suggestedFix ? parseSuggestedFix(f.suggestedFix, { startLine, endLine }) : undefined,
  };
}

/**
 * Parse a model-emitted suggestedFix into the typed SuggestedFix. Accepts both
 * the current schema (oldString/newString + optional context lines) and the
 * legacy schema (just replacement). Records from history may carry either
 * shape, so we preserve whichever fields are present and let the applier
 * pick its strategy at apply-time.
 *
 * String coercion: when the model emits null/undefined we normalize to ''
 * for prose fields, but oldString/newString/contextBefore/contextAfter only
 * exist on the result when the model actually provided them — an empty
 * oldString would silently match the start of every file, so absent is
 * meaningfully different from empty here.
 */
function parseSuggestedFix(
  raw: any,
  range: { startLine: number; endLine: number },
): import('../types').SuggestedFix {
  const fix: import('../types').SuggestedFix = {
    description: String(raw.description ?? ''),
    range,
    confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'medium',
  };
  if (typeof raw.oldString === 'string' && raw.oldString.length > 0) {
    fix.oldString = raw.oldString;
  }
  if (typeof raw.newString === 'string') {
    fix.newString = raw.newString;
  }
  if (typeof raw.contextBefore === 'string' && raw.contextBefore.length > 0) {
    fix.contextBefore = raw.contextBefore;
  }
  if (typeof raw.contextAfter === 'string' && raw.contextAfter.length > 0) {
    fix.contextAfter = raw.contextAfter;
  }
  // Legacy fallback path — older history records and any model still emitting
  // the old schema. Kept so historical findings still apply.
  if (typeof raw.replacement === 'string') {
    fix.replacement = raw.replacement;
  }
  return fix;
}

function arr(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

/**
 * Semantic dedupe: cluster findings that target the same file within a small
 * line proximity (±3) and share a similar normalized title or the same
 * category. Within each cluster, keep the highest-severity finding and merge
 * supporting fields from the rest.
 *
 * Findings marked with isRelated (title starts with "Related:") are NEVER
 * merged into their referent — the prefix exists precisely to keep them as
 * distinct angles.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const buckets: Finding[][] = [];

  for (const f of findings) {
    if (isRelatedFinding(f)) {
      // Related findings live in their own bucket so they survive dedupe.
      buckets.push([f]);
      continue;
    }
    const bucket = findMatchingBucket(buckets, f);
    if (bucket) bucket.push(f);
    else buckets.push([f]);
  }

  const result: Finding[] = [];
  for (const bucket of buckets) {
    if (bucket.length === 1) {
      result.push(bucket[0]);
      continue;
    }
    bucket.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    let merged = bucket[0];
    for (let i = 1; i < bucket.length; i++) merged = mergeFindings(merged, bucket[i]);
    result.push(merged);
  }

  return result.sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.range.startLine - b.range.startLine;
  });
}

const LINE_PROXIMITY = 5;

function findMatchingBucket(buckets: Finding[][], f: Finding): Finding[] | null {
  for (const bucket of buckets) {
    const candidate = bucket[0];
    if (candidate.file !== f.file) continue;
    if (isRelatedFinding(candidate)) continue;
    if (!rangesOverlap(candidate.range, f.range, LINE_PROXIMITY)) continue;
    // 1. Strong signal: titles are clearly similar (normalized equality or
    //    token-overlap above 0.5). Same root cause regardless of category.
    if (titlesSimilar(candidate.title, f.title)) return bucket;
    // 2. Same category AND tight range overlap — classic "two passes flagged
    //    the same bug from the same angle".
    if (candidate.category === f.category && rangesOverlap(candidate.range, f.range, 0)) return bucket;
    // 3. Cross-category, loose-title match: different specialists looking at
    //    the same lines from different angles (e.g. perf + tests both flag
    //    "N+1 query in getUsers" / "missing test for getUsers loop"). Merge
    //    when there is *some* lexical overlap (Jaccard ≥ 0.3) to avoid
    //    collapsing unrelated findings that happen to live on the same line.
    if (jaccardTitleSimilarity(candidate.title, f.title) >= 0.3) return bucket;
  }
  return null;
}

function rangesOverlap(
  a: { startLine: number; endLine: number },
  b: { startLine: number; endLine: number },
  slack: number,
): boolean {
  return a.startLine - slack <= b.endLine && b.startLine - slack <= a.endLine;
}

function titlesSimilar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 12 && nb.includes(na)) return true;
  if (nb.length >= 12 && na.includes(nb)) return true;
  return jaccardTitleSimilarity(a, b) >= 0.5;
}

// Stopwords we ignore when computing title overlap — they're noise, not signal.
const TITLE_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or',
  'but', 'not', 'be', 'this', 'that', 'with', 'by', 'as', 'from', 'into', 'it',
  'its', 'related', 'missing', 'should', 'could', 'may', 'might', 'when', 'if',
]);

function titleTokens(s: string): Set<string> {
  const tokens = String(s || '')
    .toLowerCase()
    .replace(/^related:\s*/i, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !TITLE_STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccardTitleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isRelatedFinding(f: Finding): boolean {
  return /^related:\s*/i.test(f.title) || Boolean(f.relatedTo);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/^related:\s*/i, '').replace(/[^a-z0-9]/g, '').slice(0, 40);
}

function severityRank(s: Severity): number {
  // 'silenced' sits at the very bottom so dedupe never picks a silenced
  // finding over a real-severity one when both refer to the same spot.
  return { critical: 4, major: 3, minor: 2, nit: 1, praise: 0, silenced: -1 }[s];
}

function mergeFindings(primary: Finding, other: Finding): Finding {
  return {
    ...primary,
    questionsRaised: [...new Set([...primary.questionsRaised, ...other.questionsRaised])],
    alternativesConsidered: [
      ...new Set([...primary.alternativesConsidered, ...other.alternativesConsidered]),
    ],
    evidence: [...new Set([...primary.evidence, ...other.evidence])],
    relatedFiles: [...new Set([...primary.relatedFiles, ...other.relatedFiles])],
  };
}

/**
 * For each finding whose title starts with "Related:", try to find the prior
 * finding it most likely extends (same file, closest line range, no
 * "Related:" itself) and set relatedTo to that finding's id. Idempotent — if
 * relatedTo is already set, the existing value is kept.
 */
export function linkRelatedFindings(newFindings: Finding[], priorFindings: Finding[]): void {
  for (const f of newFindings) {
    if (f.relatedTo) continue;
    if (!/^related:\s*/i.test(f.title)) continue;
    const candidates = priorFindings.filter(
      (p) => p.file === f.file && !/^related:\s*/i.test(p.title),
    );
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => lineDistance(a.range, f.range) - lineDistance(b.range, f.range));
    f.relatedTo = candidates[0].id;
  }
}

function lineDistance(
  a: { startLine: number; endLine: number },
  b: { startLine: number; endLine: number },
): number {
  if (rangesOverlap(a, b, 0)) return 0;
  return Math.min(Math.abs(a.startLine - b.endLine), Math.abs(b.startLine - a.endLine));
}
