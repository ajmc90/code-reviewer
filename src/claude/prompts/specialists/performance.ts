import { ChangeMapEntry, DiffFile, FindingIndexEntry, ProjectContext, ReasoningDepth } from '../../../types';
import { Lang } from '../../../i18n';
import { buildSystemPreamble } from '../system';
import { JSON_CONTRACT_FINDINGS_ONLY, antiDuplicationBlock, changeMapBlock } from '../shared';

export function buildPerformancePrompt(args: {
  ctx: ProjectContext;
  diff: string;
  changeMap: ChangeMapEntry[];
  priorFindings: FindingIndexEntry[];
  lang: Lang;
}): string {
  return [
    buildSystemPreamble(args.ctx, 'deep', args.lang),
    '',
    '--- PHASE B — PERFORMANCE PASS ---',
    'Audit ONLY for performance concerns: hot-loop inefficiencies, N+1 queries, repeated work, unnecessary allocations, blocking I/O on hot paths, missing indexes, cache-busting patterns, accidental quadratic behaviour, large synchronous work in async contexts.',
    'Be honest about whether the perf concern is real for THIS code path (estimate frequency / data size). Files marked kind=docs/style/test are usually not worth flagging unless the cost is obvious.',
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

