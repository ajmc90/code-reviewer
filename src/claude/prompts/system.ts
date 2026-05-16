import { ProjectContext, ReasoningDepth } from '../../types';
import { Lang } from '../../i18n';
import { languageDirective } from './shared';

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
