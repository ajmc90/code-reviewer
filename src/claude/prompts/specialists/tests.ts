import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT_FINDINGS_ONLY, antiDuplicationBlock, changeMapBlock } from '../shared';

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
    JSON_CONTRACT_FINDINGS_ONLY,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── PHASE D — COMPLETENESS & ALTERNATIVES ────────────────────────────

