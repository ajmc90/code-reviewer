import { TOKENS_CSS } from './fragments/tokens';
import { RESET_CSS } from './fragments/reset';
import { LAYOUT_CSS } from './fragments/layout';
import { TWO_PANE_CSS } from './fragments/twoPaneLayout';
import { PASS_SELECTOR_CSS } from './fragments/passSelector';
import { BRANCH_PICKER_CSS } from './fragments/branchPicker';
import { TIMELINE_CSS } from './fragments/timeline';
import { LOG_CSS } from './fragments/log';
import { RIGHT_COLUMN_CSS } from './fragments/rightColumn';
import { CHANGE_MAP_CSS } from './fragments/changeMap';
import { RELATED_BADGE_CSS } from './fragments/relatedBadge';
import { FINDING_CARDS_CSS } from './fragments/findingCards';
import { RESPONSIVE_CSS } from './fragments/responsive';

/**
 * Concatenated CSS for the review panel webview. One inlined <style> block.
 *
 * Order follows the cascade you'd write by hand: tokens first (every other
 * rule references --var); reset/globals next; then layout from outside-in
 * (page → two-pane split → individual UI sections); responsive last so its
 * @media queries override base rules.
 */
export const STYLES =
  TOKENS_CSS +
  RESET_CSS +
  LAYOUT_CSS +
  TWO_PANE_CSS +
  PASS_SELECTOR_CSS +
  BRANCH_PICKER_CSS +
  TIMELINE_CSS +
  LOG_CSS +
  RIGHT_COLUMN_CSS +
  CHANGE_MAP_CSS +
  RELATED_BADGE_CSS +
  FINDING_CARDS_CSS +
  RESPONSIVE_CSS;
