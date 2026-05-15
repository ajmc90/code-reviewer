import { ClaudeCliClient } from './cliClient';
import { Finding, TranslatedFindingFields } from '../types';
import { Lang } from '../i18n';

export interface TranslateFindingArgs {
  cli: ClaudeCliClient;
  finding: Finding;
  targetLang: Lang;
  cwd: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Translate a single finding's user-visible string fields to the target
 * language. Fields untouched: id, file, range, severity, category, confidence,
 * pass, relatedFiles, suggestedFix.range, suggestedFix.confidence — those are
 * identifiers or enum values, not user prose.
 *
 * The prompt asks Claude to return JSON with the same shape as the input so
 * arrays preserve their order and length. Strict parsing tolerates fenced
 * blocks since the CLI occasionally wraps JSON.
 */
export async function translateFinding(args: TranslateFindingArgs): Promise<TranslatedFindingFields> {
  const source = pickSourceFields(args.finding);
  const langName = args.targetLang === 'es' ? 'Spanish (neutral Latin American)' : 'English';
  const prompt = buildPrompt(source, langName);

  const result = await args.cli.run(prompt, {
    cwd: args.cwd,
    model: args.model,
    timeoutMs: args.timeoutMs,
  });

  const parsed = parseJsonObject(result.text);
  return normalize(parsed, source);
}

function pickSourceFields(f: Finding): TranslatedFindingFields {
  return {
    title: f.title,
    description: f.description,
    reasoning: f.reasoning,
    questionsRaised: f.questionsRaised ?? [],
    alternativesConsidered: f.alternativesConsidered ?? [],
    evidence: f.evidence ?? [],
    suggestedFix: f.suggestedFix
      ? { description: f.suggestedFix.description, replacement: f.suggestedFix.replacement }
      : undefined,
  };
}

function buildPrompt(source: TranslatedFindingFields, langName: string): string {
  return [
    `You are translating a single code-review finding to ${langName}.`,
    '',
    'Rules:',
    '- Translate ONLY user-visible prose. Preserve technical terms (function/variable names, file paths, code snippets, library names) untouched.',
    '- Inside suggestedFix.replacement, the value is CODE. Keep the code verbatim; only translate inline comments if any.',
    '- Inside evidence, items are quoted diff snippets. Keep them verbatim — DO NOT translate code.',
    '- Preserve array order and length exactly. If an input array has 3 items, the output array MUST have 3 items.',
    '- Preserve all field names exactly as given. JSON keys must NOT be translated.',
    '- No prose outside the JSON. No markdown fences. Output ONLY the JSON object.',
    '',
    'Input JSON:',
    JSON.stringify(source, null, 2),
    '',
    `Return a JSON object with the same shape, translated to ${langName}. Output ONLY the JSON.`,
  ].join('\n');
}

/**
 * Extract a JSON object from Claude's response. Tolerates leading/trailing
 * whitespace and an optional ```json fence the CLI sometimes emits despite
 * the prompt asking for raw JSON.
 */
function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  // Strip a ```json … ``` or ``` … ``` fence if present.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : trimmed;
  // First-pass: try parsing as-is.
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  // Second-pass: find the first { and last } and try the substring.
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const slice = body.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  throw new Error('Translator returned non-JSON output.');
}

/**
 * Coerce Claude's response into the strict TranslatedFindingFields shape.
 * Falls back to source values when a field is missing or malformed so a
 * partial-translation never blanks out the row.
 */
function normalize(parsed: Record<string, unknown>, source: TranslatedFindingFields): TranslatedFindingFields {
  const asString = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
  const asStringArray = (v: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(v)) return fallback;
    const out = v.map((x) => (typeof x === 'string' ? x : ''));
    // Pad or truncate to match source length — keeps positional UI stable.
    if (out.length < fallback.length) {
      return [...out, ...fallback.slice(out.length)];
    }
    if (out.length > fallback.length) {
      return out.slice(0, fallback.length);
    }
    return out;
  };

  const fix = source.suggestedFix
    ? (() => {
        const f = parsed.suggestedFix as Record<string, unknown> | undefined;
        return {
          description: asString(f?.description, source.suggestedFix.description),
          replacement: asString(f?.replacement, source.suggestedFix.replacement),
        };
      })()
    : undefined;

  return {
    title: asString(parsed.title, source.title),
    description: asString(parsed.description, source.description),
    reasoning: asString(parsed.reasoning, source.reasoning),
    questionsRaised: asStringArray(parsed.questionsRaised, source.questionsRaised),
    alternativesConsidered: asStringArray(parsed.alternativesConsidered, source.alternativesConsidered),
    evidence: asStringArray(parsed.evidence, source.evidence),
    suggestedFix: fix,
  };
}
