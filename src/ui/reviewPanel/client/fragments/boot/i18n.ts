/**
 * Injects the i18n message dictionary and current language into the webview,
 * and exposes the tMsg() lookup helper used by every render function.
 *
 * The host substitutes __MESSAGES_JSON__ and __LANG_JSON__ at script build
 * time via bundle.ts.
 */
export const I18N = `
  const MESSAGES = __MESSAGES_JSON__;
  let LANG = __LANG_JSON__;
  function tMsg(key, params){
    const dict = MESSAGES[LANG] || MESSAGES.en;
    const tmpl = (dict && dict[key]) || (MESSAGES.en && MESSAGES.en[key]) || key;
    if (!params) return tmpl;
    return String(tmpl).replace(/\\{(\\w+)\\}/g, (_, k) => {
      const v = params[k];
      return v === undefined || v === null ? '' : String(v);
    });
  }
`;
