import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT_FINDINGS_ONLY, antiDuplicationBlock, changeMapBlock } from '../shared';


// ─── PHASE B — SPECIALISTS ────────────────────────────────────────────

export function buildSecurityPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE B — SECURITY PASS ---',
    'Audit ONLY for security concerns: injection (SQL, command, prompt), XSS, SSRF, path traversal, broken auth/authz, secret leakage, unsafe deserialization, weak crypto, missing input validation at trust boundaries, supply-chain risk in new dependencies, race conditions with security impact, insecure defaults.',
    'Focus on files where kind ∈ {new-feature, config, deps, migration} or blastRadius ∈ {module, cross-cutting}. You can skim/skip docs/style/test files unless they reveal a credential.',
    'If there are no real security issues, return findings: [] (just the empty array, no commentary).',
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

