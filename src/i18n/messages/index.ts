import { EN } from './en';
import { ES } from './es';

/**
 * Bilingual string dictionary.
 *
 * Plain JSON-serializable so the same object is shipped to the webview as
 * `JSON.stringify(messages)`. Templates use `{name}` placeholders resolved
 * by `format()` in the parent `index.ts`.
 *
 * Master is `en`. Any key missing from `es` falls back to `en` at runtime.
 */
export const messages = { en: EN, es: ES } as const;

export type Lang = 'en' | 'es';
export type MsgKey = keyof typeof EN;
