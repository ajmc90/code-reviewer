import { Finding, Severity, Category } from '../types';
import { Lang } from '../i18n';
import { extractJson } from './parser';

export type CritiqueAction = 'keep' | 'drop' | 'merge' | 'revise';

export interface CritiqueDecision {
  /** Short id of the prior finding ("f1", "f2", …). */
  id: string;
  action: CritiqueAction;
  /** Required for drop/merge/revise. */
  reason?: string;
  /** Required for merge. Points at another prior id or a new-finding id ("nf1"). */
  mergeIntoId?: string;
  /** Required for revise. The full new finding shape. */
  revised?: any;
}

export interface CritiqueParseResult {
  decisions: CritiqueDecision[];
  /** Additive new findings; may carry temporary ids like "nf1" referenced by merges. */
  newFindings: any[];
}

const VALID_ACTIONS: CritiqueAction[] = ['keep', 'drop', 'merge', 'revise'];

const VALID_SEVERITY: Severity[] = ['critical', 'major', 'minor', 'nit', 'praise'];
const VALID_CATEGORY: Category[] = [
  'bug', 'security', 'performance', 'correctness', 'maintainability',
  'readability', 'tests', 'docs', 'style', 'architecture',
  'accessibility', 'concurrency', 'data-integrity', 'api-contract', 'other',
];

/**
 * Parse critique's JSON response into a typed decision list + new findings.
 *
 * Robust to: missing fields, unknown actions (downgraded to 'drop' with a
 * synthetic reason), and the model accidentally putting prior findings into
 * `findings[]` (we don't filter those out here — the orchestrator does, since
 * only it knows which ids were prior).
 */
export function parseCritiqueOutput(text: string): CritiqueParseResult {
  const jsonStr = extractJson(text);
  if (!jsonStr) return { decisions: [], newFindings: [] };
  let raw: any;
  try { raw = JSON.parse(jsonStr); }
  catch {
    const repaired = jsonStr
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    try { raw = JSON.parse(repaired); } catch { return { decisions: [], newFindings: [] }; }
  }

  const decisionsIn = Array.isArray(raw.decisions) ? raw.decisions : [];
  const decisions: CritiqueDecision[] = [];
  for (const d of decisionsIn) {
    if (!d || typeof d !== 'object') continue;
    if (typeof d.id !== 'string' || !d.id) continue;
    const action: CritiqueAction = VALID_ACTIONS.includes(d.action) ? d.action : 'drop';
    const out: CritiqueDecision = { id: d.id, action };
    if (action !== 'keep') {
      out.reason = typeof d.reason === 'string' ? d.reason : '';
    }
    if (action === 'merge') {
      out.mergeIntoId = typeof d.mergeIntoId === 'string' ? d.mergeIntoId : '';
    }
    if (action === 'revise') {
      out.revised = d.revised && typeof d.revised === 'object' ? d.revised : null;
      // A revise with no revised payload is useless — degrade to keep so the
      // finding survives unchanged rather than silently disappearing.
      if (!out.revised) {
        out.action = 'keep';
        delete out.reason;
      }
    }
    decisions.push(out);
  }

  const newFindings = Array.isArray(raw.findings) ? raw.findings : [];
  return { decisions, newFindings };
}

/**
 * Convert a critique-emitted finding object (used as a 'revise' payload or
 * appended via `findings[]`) into a runtime Finding. Reuses the shape rules
 * from the generic parser but kept inline here because the critique path needs
 * to preserve the optional `id` field (for merge references) before the
 * orchestrator assigns the real one.
 */
export function normalizeCritiqueFinding(
  f: any,
  fallbackId: string,
  lang: Lang,
): { finding: Finding; tempId: string | null } {
  const startLine = Math.max(1, parseInt(f?.startLine, 10) || 1);
  const endLine = Math.max(startLine, parseInt(f?.endLine, 10) || startLine);
  const severity: Severity = VALID_SEVERITY.includes(f?.severity) ? f.severity : 'minor';
  const category: Category = VALID_CATEGORY.includes(f?.category) ? f.category : 'other';
  const tempId = typeof f?.id === 'string' && f.id ? f.id : null;
  return {
    tempId,
    finding: {
      id: fallbackId,
      file: typeof f?.file === 'string' ? f.file : '',
      range: { startLine, endLine },
      severity,
      category,
      title: String(f?.title ?? 'Untitled finding').slice(0, 200),
      description: String(f?.description ?? ''),
      reasoning: String(f?.reasoning ?? ''),
      questionsRaised: toStringArray(f?.questionsRaised),
      alternativesConsidered: toStringArray(f?.alternativesConsidered),
      evidence: toStringArray(f?.evidence),
      relatedFiles: toStringArray(f?.relatedFiles),
      confidence: ['high', 'medium', 'low'].includes(f?.confidence) ? f.confidence : 'medium',
      pass: 'critique',
      originalLang: lang,
      suggestedFix: f?.suggestedFix
        ? parseCritiqueSuggestedFix(f.suggestedFix, { startLine, endLine })
        : undefined,
    },
  };
}

/**
 * Mirror of parser.ts:parseSuggestedFix — kept local to avoid a circular dep
 * between parser modules. Same accept-both-schemas behavior: new fixes carry
 * oldString/newString (+ optional context), legacy critique output may still
 * carry just `replacement`, and the applier picks its strategy at apply time.
 */
function parseCritiqueSuggestedFix(
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
  if (typeof raw.replacement === 'string') {
    fix.replacement = raw.replacement;
  }
  return fix;
}

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}
