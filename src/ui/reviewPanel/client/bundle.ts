import { messages as MESSAGES_DICT } from '../../../i18n/messages';
import type { Lang } from '../../../i18n';

// Boot: opens/closes the IIFE and wires the i18n payload that every renderer
// reads through tMsg.
import { PRELUDE } from './fragments/boot/prelude';
import { I18N } from './fragments/boot/i18n';
import { POSTLUDE } from './fragments/boot/postlude';

// Core: constants + pure utilities + shared state + estimator + dedupe.
// No DOM writes. Anything in renderers/ or handlers/ depends on this layer.
import { PASSES } from './fragments/core/passes';
import { UTILS } from './fragments/core/utils';
import { STATE } from './fragments/core/state';
import { ESTIMATE } from './fragments/core/estimate';
import { DEDUP } from './fragments/core/dedup';

// Renderers: every render* / build* function. Read state, write DOM.
import { COUNTERS } from './fragments/renderers/counters';
import { LIVE_LOG } from './fragments/renderers/liveLog';
import { CATEGORY_CHIPS } from './fragments/renderers/categoryChips';
import { RESUME_BANNER } from './fragments/renderers/resumeBanner';
import { CHANGE_MAP } from './fragments/renderers/changeMap';
import { RAIL } from './fragments/renderers/rail';
import { BRANCH_PICKER } from './fragments/renderers/branchPicker';
import { RUN_CARD } from './fragments/renderers/runCard';
import { TIMELINE } from './fragments/renderers/timeline';
import { FINDINGS } from './fragments/renderers/findings';
import { PASS_SELECTOR } from './fragments/renderers/passSelector';

// Handlers: DOM event listeners + the host-message router. Reactions to user
// input or to events from the orchestrator.
import { COLLAPSE } from './fragments/handlers/collapse';
import { DOM_HANDLERS } from './fragments/handlers/domHandlers';
import { BUTTONS } from './fragments/handlers/buttons';
import { EVENT_STREAM } from './fragments/handlers/eventStream';
import { MESSAGE_ROUTER } from './fragments/handlers/messageRouter';

/**
 * Assemble the webview client script from ordered fragments. The result is a
 * single self-invoking function (one shared closure) that gets inlined into
 * the panel HTML.
 *
 * Order matters: declarations a fragment depends on must appear earlier in
 * the list. All fragments share the same closure scope — they are NOT modules
 * in the runtime sense.
 *
 * Load order is the dependency order:
 *   1. boot.prelude        opens IIFE, captures vscode + $ helpers
 *   2. boot.i18n           seeds the message dictionary used by tMsg
 *   3. core.*              constants → utils → state → estimator → dedupe
 *      (state must precede everything that reads it; estimator + dedupe both
 *      read state.)
 *   4. renderers.*         every render function that writes DOM
 *   5. handlers.collapse   layout control (drag + collapse + keyboard)
 *   6. handlers.domHandlers + buttons   wires document + #btn-* listeners
 *   7. handlers.eventStream  applyEvent dispatch (calls every render)
 *   8. handlers.messageRouter window.message + initial paint + ready signal
 *   9. boot.postlude       closes IIFE
 */
function assembleClientScript(): string {
  return [
    PRELUDE,
    I18N,
    // core
    PASSES,
    UTILS,
    STATE,
    ESTIMATE,
    DEDUP,
    // renderers
    COUNTERS,
    LIVE_LOG,
    CATEGORY_CHIPS,
    RESUME_BANNER,
    CHANGE_MAP,
    RAIL,
    BRANCH_PICKER,
    RUN_CARD,
    TIMELINE,
    FINDINGS,
    PASS_SELECTOR,
    // handlers
    COLLAPSE,
    DOM_HANDLERS,
    BUTTONS,
    EVENT_STREAM,
    MESSAGE_ROUTER,
    POSTLUDE,
  ].join('\n');
}

/**
 * Substitute the i18n payload placeholders and return the script ready to be
 * dropped into a <script nonce="..."> tag.
 */
export function buildClientScript(lang: Lang): string {
  const messagesJson = JSON.stringify(MESSAGES_DICT);
  const langJson = JSON.stringify(lang);
  return assembleClientScript()
    .replace('__MESSAGES_JSON__', () => messagesJson)
    .replace('__LANG_JSON__', () => langJson);
}
