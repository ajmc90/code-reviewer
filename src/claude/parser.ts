import { Finding, ReviewSummary, Severity, Category } from '../types';
import { Lang } from '../i18n';

interface RawOutput {
  summary?: Partial<ReviewSummary>;
  findings?: any[];
}

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

export function parseClaudeOutput(text: string, lang: Lang = 'en'): { summary?: ReviewSummary; findings: Finding[] } {
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
      overallVerdict: (raw.summary.overallVerdict as any) ?? 'approve-with-comments',
      executiveSummary: raw.summary.executiveSummary ?? '',
      topConcerns: Array.isArray(raw.summary.topConcerns) ? raw.summary.topConcerns : [],
      strengths: Array.isArray(raw.summary.strengths) ? raw.summary.strengths : [],
      riskScore: typeof raw.summary.riskScore === 'number' ? raw.summary.riskScore : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  return { summary, findings };
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
    suggestedFix: f.suggestedFix
      ? {
          description: String(f.suggestedFix.description ?? ''),
          replacement: String(f.suggestedFix.replacement ?? ''),
          range: { startLine, endLine },
          confidence: ['high', 'medium', 'low'].includes(f.suggestedFix.confidence)
            ? f.suggestedFix.confidence
            : 'medium',
        }
      : undefined,
  };
}

function arr(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

/**
 * Dedupe findings that target the same file/line range and have very similar
 * titles. Multi-pass reviews can produce overlapping comments.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.file}:${f.range.startLine}-${f.range.endLine}:${normalize(f.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, f);
      continue;
    }
    if (severityRank(f.severity) > severityRank(existing.severity)) {
      seen.set(key, mergeFindings(f, existing));
    } else {
      seen.set(key, mergeFindings(existing, f));
    }
  }
  return [...seen.values()].sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.range.startLine - b.range.startLine;
  });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
}

function severityRank(s: Severity): number {
  return { critical: 4, major: 3, minor: 2, nit: 1, praise: 0 }[s];
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
