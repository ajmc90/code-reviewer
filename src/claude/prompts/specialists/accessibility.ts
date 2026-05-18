import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT_FINDINGS_ONLY, antiDuplicationBlock, changeMapBlock } from '../shared';

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
    JSON_CONTRACT_FINDINGS_ONLY,
  ]
    .filter(Boolean)
    .join('\n');
}

