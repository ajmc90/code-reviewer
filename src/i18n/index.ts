import * as vscode from 'vscode';
import { Lang, MsgKey, messages } from './messages';

export { messages };
export type { Lang, MsgKey };

const STATE_KEY = 'claudeReviewer.language';

/** EventEmitter notified when the user toggles the panel language. */
const languageChangeEmitter = new vscode.EventEmitter<Lang>();
export const onDidChangeLanguage = languageChangeEmitter.event;

export function getLang(context: vscode.ExtensionContext): Lang {
  const raw = context.globalState.get<string>(STATE_KEY);
  return raw === 'es' ? 'es' : 'en';
}

export async function setLang(context: vscode.ExtensionContext, lang: Lang): Promise<void> {
  await context.globalState.update(STATE_KEY, lang);
  languageChangeEmitter.fire(lang);
}

/**
 * Replaces `{name}` placeholders in a template with values from `params`.
 * Missing params resolve to an empty string. Used both extension-side and,
 * via the inlined webview copy, inside webview JS.
 */
export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * Look up a translated string. Falls back to English, then to the key itself
 * so missing translations are visible without crashing.
 */
export function t(key: MsgKey, lang: Lang, params?: Record<string, string | number>): string {
  const dict = messages[lang] ?? messages.en;
  const template = (dict as Record<string, string>)[key] ?? messages.en[key] ?? key;
  return format(template, params);
}

/**
 * Curried helper for sites that translate many strings with the same lang —
 * a webview's render() doesn't want to repeat `getLang(context)` everywhere.
 */
export function translator(lang: Lang): (key: MsgKey, params?: Record<string, string | number>) => string {
  return (key, params) => t(key, lang, params);
}
