import * as vscode from 'vscode';
import * as path from 'path';
import { Finding } from '../types';

/**
 * In-memory provider for the "claude-fix:" URI scheme. We use a virtual
 * document as the RIGHT side of a diff editor so the user can review the
 * suggested fix exactly as VS Code shows any other diff, then either accept
 * (which writes the right side into the real file) or close.
 *
 * URI shape: claude-fix:/relative/path.ts?findingId=abc-123
 * The path is preserved verbatim so VS Code picks the right language for
 * syntax highlighting from the file extension.
 */
export class FixPreviewProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'claude-fix';

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  /** key: uri.toString() → preview content (with the fix applied). */
  private contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  /** Register content for a virtual URI. Returns the URI for opening. */
  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  /** Free memory once the preview is closed/accepted. */
  clear(uri: vscode.Uri): void {
    this.contents.delete(uri.toString());
  }

  /**
   * Build the virtual URI a finding's fix preview lives under. Includes the
   * finding id as a query param so command handlers can recover the finding
   * later (the diff editor only knows the URI).
   */
  static uriFor(finding: Finding): vscode.Uri {
    return vscode.Uri.from({
      scheme: FixPreviewProvider.scheme,
      path: '/' + finding.file,
      query: `findingId=${encodeURIComponent(finding.id)}`,
    });
  }

  /** Extract the finding id from a claude-fix URI, if it has one. */
  static findingIdFrom(uri: vscode.Uri): string | null {
    if (uri.scheme !== FixPreviewProvider.scheme) return null;
    const match = /findingId=([^&]+)/.exec(uri.query);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * Outcome of attempting to apply a suggested fix to a file buffer. The
 * applier returns one of these instead of throwing so the caller can render
 * a precise UI message ("ambiguous match", "no match", etc.) and decide
 * whether to still show the diff preview.
 */
export type ApplyFixResult =
  | { kind: 'ok'; text: string; strategy: ApplyStrategy }
  | { kind: 'no-match'; reason: string }
  | { kind: 'ambiguous'; matchCount: number }
  /**
   * The fix's newString already appears verbatim in the file and oldString
   * doesn't — the change is either already applied or the user is sitting on
   * a different branch than the one that was reviewed. We treat this as a
   * distinct outcome so the UI can surface "nothing to do" / "switch branch"
   * instead of the misleading "fix doesn't match the current file".
   */
  | { kind: 'already-applied' };

export type ApplyStrategy =
  | 'exact'                  // oldString matched byte-for-byte, exactly once
  | 'whitespace-insensitive' // matched after collapsing whitespace
  | 'indent-relative'        // matched after normalizing leading indent
  | 'context-disambiguated'  // multi-match resolved by anchoring on contextBefore/contextAfter
  | 'line-range';            // legacy fallback: replaced lines [startLine..endLine]

/**
 * Apply a Finding's suggestedFix to the current file text. The canonical
 * path is search/replace via oldString → newString, which is robust against
 * line-number drift between the model's snapshot and the live file. When
 * oldString is absent (legacy fix records) we fall back to the original
 * line-range substitution.
 *
 * Strategy cascade — each step is tried in order, the first non-ambiguous
 * match wins:
 *   1. exact                  — indexOf(oldString) exactly once.
 *   2. whitespace-insensitive — collapse runs of whitespace; useful when the
 *                               model normalized indentation in its output.
 *   3. indent-relative        — preserve relative indentation but re-anchor to
 *                               the file's actual leading indent on each line.
 *   4. context-disambiguated  — if oldString matches >1x, prepend
 *                               contextBefore (and/or append contextAfter)
 *                               and retry exact-match.
 *   5. line-range             — pure legacy fallback for fixes that only
 *                               carry { replacement }.
 *
 * Returns {kind: 'ok'} on success, {kind: 'no-match'} when every strategy
 * fails, and {kind: 'ambiguous'} when multiple matches survive disambiguation.
 * The legacy path always returns 'ok' (replacing lines by index can't fail).
 */
export function applyFixToBuffer(originalText: string, finding: Finding): ApplyFixResult {
  if (!finding.suggestedFix) {
    return { kind: 'no-match', reason: 'No suggestedFix attached to finding.' };
  }
  const fix = finding.suggestedFix;

  // Normalize line endings to LF for both the file and the search strings.
  // Files on Windows / files saved with mixed endings frequently store CRLF,
  // but the model practically always emits LF in its JSON output — that
  // mismatch alone breaks every byte-for-byte search. We do the substitution
  // in the LF-normalized space and then re-apply the original EOL convention
  // so the rewritten file keeps the user's line-ending style.
  const eol = detectEol(originalText);
  const normText = originalText.replace(/\r\n/g, '\n');

  // New schema: oldString/newString. The applier never writes when oldString
  // doesn't resolve to exactly one match — silent corruption is the failure
  // mode we are fixing.
  if (typeof fix.oldString === 'string' && fix.oldString.length > 0 && typeof fix.newString === 'string') {
    const normOld = fix.oldString.replace(/\r\n/g, '\n');
    const normNew = fix.newString.replace(/\r\n/g, '\n');
    const normBefore = fix.contextBefore?.replace(/\r\n/g, '\n');
    const normAfter = fix.contextAfter?.replace(/\r\n/g, '\n');
    const result = applyBySearchReplace(normText, normOld, normNew, normBefore, normAfter);
    if (result.kind === 'ok') {
      return { ...result, text: eol === '\r\n' ? result.text.replace(/\n/g, '\r\n') : result.text };
    }
    if (result.kind !== 'no-match') return result;
    // Some legacy records carry both fields. If search/replace produces no
    // match but `replacement` is also present, fall through to the line-range
    // path instead of giving up — historical fixes don't have oldString and
    // can't be re-derived.
    if (typeof fix.replacement !== 'string') return result;
  }

  // Legacy line-range path. Kept verbatim from the pre-cascade implementation
  // so fixes saved before this schema landed still apply.
  if (typeof fix.replacement === 'string') {
    const lines = originalText.split('\n');
    const start = Math.max(0, finding.range.startLine - 1);
    const end = Math.max(start, finding.range.endLine - 1);
    const before = lines.slice(0, start);
    const after = lines.slice(end + 1);
    const replacement = fix.replacement.split('\n');
    return {
      kind: 'ok',
      text: [...before, ...replacement, ...after].join('\n'),
      strategy: 'line-range',
    };
  }

  return { kind: 'no-match', reason: 'suggestedFix is missing both oldString/newString and replacement.' };
}

/**
 * Pick the dominant line-ending in the file so we can restore it after doing
 * the replacement in LF-normalized space. Heuristic: if more CRLF than bare
 * LF occurrences appear in the original, the file is CRLF; otherwise treat
 * it as LF (the overwhelming default on macOS/Linux and in modern repos).
 */
function detectEol(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  if (crlf === 0) return '\n';
  // Count bare LFs (LFs not preceded by CR). If even one is bare, we already
  // have mixed endings — defaulting to LF in that case keeps the rewritten
  // file from gaining CRs on lines that didn't have them.
  const allLf = (text.match(/\n/g) ?? []).length;
  const bareLf = allLf - crlf;
  return bareLf === 0 ? '\r\n' : '\n';
}

function applyBySearchReplace(
  text: string,
  oldString: string,
  newString: string,
  contextBefore: string | undefined,
  contextAfter: string | undefined,
): ApplyFixResult {
  // 1. Exact match.
  const exactCount = countOccurrences(text, oldString);
  if (exactCount === 1) {
    return { kind: 'ok', text: text.replace(oldString, () => newString), strategy: 'exact' };
  }
  if (exactCount > 1) {
    // Try context-disambiguation before declaring ambiguity. Wrapping the
    // search string with the model-supplied context lines usually resolves
    // common-pattern multi-matches (e.g. a "return null;" that appears 5x).
    const disambiguated = tryContextDisambiguation(text, oldString, newString, contextBefore, contextAfter);
    if (disambiguated) return disambiguated;
    return { kind: 'ambiguous', matchCount: exactCount };
  }

  // 2. Whitespace-insensitive match — normalize runs of whitespace in both
  //    the file and the search string, then look up the original span via
  //    an offset map so the replacement lands on the real characters. This
  //    handles the common case of the model collapsing tabs/spaces or
  //    re-flowing lines in its JSON output.
  const wsHit = whitespaceInsensitiveFind(text, oldString);
  if (wsHit && wsHit.matchCount === 1) {
    return {
      kind: 'ok',
      text: text.slice(0, wsHit.start) + newString + text.slice(wsHit.end),
      strategy: 'whitespace-insensitive',
    };
  }

  // 3. Indent-relative match — strip the smallest common leading-whitespace
  //    prefix from oldString's lines, do an exact search for that body, and
  //    if found, re-indent newString to match the file's actual prefix at
  //    that location.
  const indentHit = indentRelativeFind(text, oldString, newString);
  if (indentHit) return indentHit;

  // 4. Already-applied detection. When oldString doesn't match anywhere but
  //    newString does, the most likely explanation isn't a stale review — it's
  //    that the user is sitting on a branch where this fix was already merged
  //    (or someone hand-applied it). Telling them "fix doesn't match the file"
  //    is misleading in that case; "already applied / wrong branch" is the
  //    actionable diagnosis. We also try a whitespace-insensitive search for
  //    newString so the detection survives reformatting.
  if (newString.length > 0 && newString.trim() !== oldString.trim()) {
    const newExact = countOccurrences(text, newString);
    if (newExact > 0) return { kind: 'already-applied' };
    const wsHit = whitespaceInsensitiveFind(text, newString);
    if (wsHit && wsHit.matchCount >= 1) return { kind: 'already-applied' };
  }

  return { kind: 'no-match', reason: 'oldString does not appear in the current file.' };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * When oldString matches more than once, try wrapping it with the surrounding
 * context lines the model supplied. We accept the disambiguation only when the
 * wrapped string matches exactly once — otherwise we leave the caller to
 * report the ambiguity rather than guessing.
 */
function tryContextDisambiguation(
  text: string,
  oldString: string,
  newString: string,
  contextBefore: string | undefined,
  contextAfter: string | undefined,
): ApplyFixResult | null {
  const before = contextBefore ? ensureTrailingNewline(contextBefore) : '';
  const after = contextAfter ? ensureLeadingNewline(contextAfter) : '';
  if (!before && !after) return null;
  const wrapped = before + oldString + after;
  if (countOccurrences(text, wrapped) === 1) {
    const replacement = before + newString + after;
    return { kind: 'ok', text: text.replace(wrapped, () => replacement), strategy: 'context-disambiguated' };
  }
  return null;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}
function ensureLeadingNewline(s: string): string {
  return s.startsWith('\n') ? s : '\n' + s;
}

/**
 * Build a normalized copy of `text` where every run of whitespace collapses
 * to a single space, keeping a parallel offset map from each normalized
 * character back to its index in the original text. Searching the normalized
 * needle against the normalized haystack lets us locate matches where the
 * only difference was whitespace formatting; the offset map recovers the
 * exact original span so the replacement reuses the file's real characters
 * outside the match.
 */
function whitespaceInsensitiveFind(
  text: string,
  needle: string,
): { start: number; end: number; matchCount: number } | null {
  const { norm: normText, map } = normalizeWhitespaceWithMap(text);
  const { norm: normNeedle } = normalizeWhitespaceWithMap(needle);
  if (!normNeedle) return null;
  let count = 0;
  let firstHit = -1;
  let idx = normText.indexOf(normNeedle);
  while (idx !== -1) {
    if (firstHit === -1) firstHit = idx;
    count++;
    idx = normText.indexOf(normNeedle, idx + normNeedle.length);
  }
  if (count === 0 || firstHit === -1) return null;
  // Only the unique-match case is acted on; >1 means we can't safely pick
  // one without more context.
  if (count !== 1) return { start: 0, end: 0, matchCount: count };
  const start = map[firstHit];
  // End offset is one past the last consumed char. The map only stores
  // start-of-character indices, so we compute the end from the last
  // normalized index in the match.
  const lastNormIdx = firstHit + normNeedle.length - 1;
  const lastOrigIdx = map[lastNormIdx];
  // Walk forward in the original text past any trailing whitespace that
  // collapsed into the final normalized char.
  let end = lastOrigIdx + 1;
  while (end < text.length && /\s/.test(text[end]) && normNeedle[normNeedle.length - 1] === ' ') {
    end++;
  }
  return { start, end, matchCount: 1 };
}

function normalizeWhitespaceWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (!inSpace) {
        norm += ' ';
        map.push(i);
        inSpace = true;
      }
    } else {
      norm += c;
      map.push(i);
      inSpace = false;
    }
  }
  return { norm: norm.trim(), map: norm.startsWith(' ') ? map.slice(1) : map };
}

/**
 * Strip the smallest common leading-whitespace prefix from each line of
 * `oldString`, search the file for the dedented body, and on a unique hit
 * re-anchor `newString` to the file's actual indent at that location. This
 * recovers from models that normalized indent in their JSON output (e.g.
 * 2-space → 4-space, or stripped a leading tab).
 */
function indentRelativeFind(text: string, oldString: string, newString: string): ApplyFixResult | null {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const oldDedent = stripCommonIndent(oldLines);
  if (oldDedent.prefix === null) return null;
  // Don't try this path when the dedent doesn't actually change anything —
  // we'd just be re-running the exact match that already failed.
  if (oldDedent.prefix === '') return null;
  const dedentedNeedle = oldDedent.lines.join('\n');
  const matches = countOccurrences(text, dedentedNeedle);
  if (matches !== 1) return null;
  // Detect the file's leading indent at the match site so we can reapply it
  // to newString. The match itself contains no leading indent (we stripped
  // it), so we read the characters immediately before the match up to the
  // previous newline.
  const idx = text.indexOf(dedentedNeedle);
  const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
  const fileIndent = text.slice(lineStart, idx);
  if (!/^\s*$/.test(fileIndent)) return null;
  const newDedent = stripCommonIndent(newLines);
  if (newDedent.prefix === null) return null;
  const reindented = newDedent.lines.map((l, i) => (i === 0 ? l : fileIndent + l)).join('\n');
  return {
    kind: 'ok',
    text: text.slice(0, idx) + reindented + text.slice(idx + dedentedNeedle.length),
    strategy: 'indent-relative',
  };
}

/**
 * Returns the smallest common leading-whitespace prefix across all non-empty
 * lines of `lines`, plus the lines with that prefix stripped. Blank lines are
 * ignored when computing the prefix (they shouldn't force the common to ''
 * just because they have zero indent).
 */
function stripCommonIndent(lines: string[]): { prefix: string | null; lines: string[] } {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => /^[\t ]*/.exec(l)![0]);
  if (indents.length === 0) return { prefix: '', lines };
  let prefix = indents[0];
  for (const ind of indents.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < ind.length && prefix[i] === ind[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix === '') break;
  }
  if (prefix === '') return { prefix: '', lines };
  const stripped = lines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l));
  return { prefix, lines: stripped };
}

/**
 * Open a side-by-side diff editor that compares the file on disk to its
 * fix-applied counterpart. Returns the URIs so callers can dispose later, or
 * null when the fix cannot be applied (no match / ambiguous match) — the
 * caller is responsible for surfacing that to the user. We refuse to open
 * the diff editor on a failed apply because the right side would be
 * indistinguishable from the original, leaving the user to wonder what they
 * are supposed to accept.
 */
export async function openFixDiff(
  finding: Finding,
  workspaceRoot: string,
  provider: FixPreviewProvider,
): Promise<{ leftUri: vscode.Uri; rightUri: vscode.Uri; result: ApplyFixResult } | null> {
  const leftUri = vscode.Uri.file(path.join(workspaceRoot, finding.file));
  const doc = await vscode.workspace.openTextDocument(leftUri);
  const result = applyFixToBuffer(doc.getText(), finding);
  if (result.kind !== 'ok') {
    return { leftUri, rightUri: leftUri, result };
  }

  const rightUri = FixPreviewProvider.uriFor(finding);
  provider.set(rightUri, result.text);

  const title = `${path.basename(finding.file)}: ${finding.title.slice(0, 60)}${finding.title.length > 60 ? '…' : ''}`;
  await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
    preview: true,
    preserveFocus: false,
  });

  return { leftUri, rightUri, result };
}
