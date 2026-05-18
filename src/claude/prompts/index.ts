/**
 * Public prompt API. Re-exports every prompt builder + the shared helpers
 * so that existing imports (`from '../claude/prompts'`) keep working.
 *
 * The prompts are grouped on disk by purpose:
 *   shared.ts             pure helpers (JSON contract, anti-dup, change map,
 *                          language directive, finding-index conversion)
 *   system.ts             the system preamble + extra-context builder
 *   specialists/*.ts      one file per analysis pass (explore, security,
 *                          performance, accessibility, tests, gaps, permute,
 *                          critique)
 *   summary.ts            the final per-result summary prompt
 */

export {
  JSON_CONTRACT,
  JSON_CONTRACT_FINDINGS_ONLY,
  antiDuplicationBlock,
  changeMapBlock,
  truncate,
  languageDirective,
  toFindingIndex,
} from './shared';

export { buildSystemPreamble, buildContextSection } from './system';

export { buildExplorePrompt, buildStructuralExplorationPrompt } from './specialists/explore';
export { buildSecurityPrompt } from './specialists/security';
export { buildPerformancePrompt } from './specialists/performance';
export { buildAccessibilityPrompt } from './specialists/accessibility';
export { buildTestsPrompt } from './specialists/tests';
export { buildGapsPrompt } from './specialists/gaps';
export { buildPermutePrompt } from './specialists/permute';
export { buildCritiquePrompt } from './specialists/critique';

export { buildSummaryPrompt } from './summary';
