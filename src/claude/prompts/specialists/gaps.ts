import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT_FINDINGS_ONLY, antiDuplicationBlock, changeMapBlock } from '../shared';

export function buildGapsPrompt(args: {
  ctx: ProjectContext;
  diff: string;
  conventions: string;
  changedFiles: DiffFile[];
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  const fileSummary = args.changedFiles
    .slice(0, 60)
    .map((f) => `${f.status[0].toUpperCase()} ${f.path}`)
    .join('\n');
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE D — GAPS (what is MISSING) ---',
    'Audit ONLY for what is MISSING — things the author probably should have touched but did not. This is the "complete the picture" lens.',
    '',
    'You will see prior findings below. Your job is to find what is missing BEYOND those — do not re-report a missing test/doc/migration that another pass already flagged. Anything you emit here should be net-new.',
    '',
    'For every meaningful change, ask:',
    '- Did they add a new endpoint / API method? Then: client/SDK regenerated? OpenAPI spec updated? Postman / fixtures? Auth/permissions enforced? Rate limit applied?',
    '- Did they add a new database column / migration? Then: backfill plan? rollback migration? ORM models updated? read paths updated? indexes considered?',
    '- Did they add a new UI component? Then: storybook story? unit/snapshot test? a11y check? translations? loading / error / empty states?',
    '- Did they add a new env var or config flag? Then: documented in README? .env.example? deployment manifests / CI secrets? feature-flag rollout plan?',
    '- Did they add a new dependency? Then: license compatible? bundle-size impact? maintained? CVEs? lock file committed?',
    '- Did they change error handling? Then: logging / telemetry / metrics for the new path? user-facing message? retry/backoff?',
    '- Did they rename / move something? Then: callers updated everywhere (grep!)? docs updated? changelog?',
    '- Did they add async work or a worker? Then: timeout? cancellation? idempotency? observability (trace span, metric)?',
    '- Did they delete code? Then: dead-code search? feature-flag cleanup? telemetry events that referenced it?',
    '- Did they touch auth flow? Then: logout/expiry path also updated? audit log?',
    '',
    'Lean on project context: if the project clearly has tests but the diff has no tests, that is a gap. If CLAUDE.md mentions a pattern that this change ignores, that is a gap.',
    '',
    changeMapBlock(args.changeMap),
    antiDuplicationBlock(args.priorFindings),
    '--- DIFF FILE SUMMARY ---',
    fileSummary,
    '',
    '--- PROJECT CONVENTIONS ---',
    args.conventions || '(none provided)',
    '',
    '--- DIFF ---',
    args.diff,
    '',
    'For each gap, produce a finding anchored to the most relevant changed file + line (the place where the missing piece SHOULD have been added or referenced). If you cannot anchor precisely, anchor to line 1 of the file most central to the change and lower confidence to "low".',
    'Use category "other" unless one of these fits better: "tests", "docs", "api-contract", "data-integrity", "architecture", "accessibility".',
    'If nothing is genuinely missing beyond what prior passes caught, return findings: [].',
    '',
    JSON_CONTRACT_FINDINGS_ONLY,
  ]
    .filter(Boolean)
    .join('\n');
}

