import * as vscode from 'vscode';
import { Category, Finding, Severity, SilencedMode } from '../../types';

const KEY = 'claudeReviewer.silencedFindings';

/**
 * One persisted dismiss rule. Stored in workspaceState so it survives reloads
 * and crosses review runs. The two modes are mutually exclusive:
 *   - 'this':    matches a finding at the same file + line range + title.
 *   - 'pattern': matches any finding with the same category + normalized title,
 *                regardless of file or line. Useful for refactor-tolerant
 *                "stop showing me XSS warnings in this layout component".
 *
 * Persisted shape is deliberately small — large fields like description or
 * evidence are NOT stored (we only need enough to match future findings).
 */
export interface SilenceRecord {
  mode: SilencedMode;
  category: Category;
  /** Normalized title used for matching. See normalizeTitle(). */
  titleKey: string;
  /** Original title kept for human-readable listing. */
  titleDisplay: string;
  /** Only set when mode='this'. */
  file?: string;
  startLine?: number;
  endLine?: number;
  dismissedAt: number;
}

/**
 * In-memory + persisted store of silence rules for the current workspace.
 * Stays a pure data class — no UI concerns. The host wires it up to commands
 * and to setResult() so freshly loaded findings get silenced as they arrive.
 */
export class SilenceStore {
  private records: SilenceRecord[] = [];
  private _onChange = new vscode.EventEmitter<void>();
  readonly onChange = this._onChange.event;

  constructor(private readonly state: vscode.Memento) {
    const raw = state.get<SilenceRecord[]>(KEY);
    if (Array.isArray(raw)) this.records = raw.filter(isValid);
  }

  list(): readonly SilenceRecord[] {
    return this.records;
  }

  /**
   * Add a new dismiss rule. If an equivalent record already exists (same
   * matching keys), it's replaced — preventing duplicate rules from piling up.
   */
  async add(record: SilenceRecord): Promise<void> {
    const idx = this.records.findIndex((r) => sameKey(r, record));
    if (idx >= 0) this.records.splice(idx, 1);
    this.records.push(record);
    await this.persist();
  }

  /** Remove the rule that matches a given silenced finding. Idempotent. */
  async remove(finding: Finding): Promise<boolean> {
    const before = this.records.length;
    this.records = this.records.filter((r) => !matches(r, finding));
    if (this.records.length !== before) {
      await this.persist();
      return true;
    }
    return false;
  }

  /** Drop every stored rule. Used by "Clear silenced memory" command. */
  async clearAll(): Promise<void> {
    if (this.records.length === 0) return;
    this.records = [];
    await this.persist();
  }

  /**
   * Walks the findings array and rewrites severity to 'silenced' on anything
   * that matches a stored rule. Idempotent and non-destructive — the original
   * severity is preserved in silencedFrom so 'Restore' can put it back.
   *
   * Returns the count of newly-silenced findings (for telemetry / UI hint).
   */
  applyTo(findings: Finding[]): number {
    let touched = 0;
    for (const f of findings) {
      // Don't re-silence; don't touch praise (it's a compliment, not noise).
      if (f.severity === 'silenced' || f.severity === 'praise') continue;
      const rule = this.records.find((r) => matches(r, f));
      if (!rule) continue;
      f.silencedFrom = f.severity;
      f.silencedMode = rule.mode;
      f.silencedAt = rule.dismissedAt;
      (f as { severity: Severity }).severity = 'silenced';
      touched++;
    }
    return touched;
  }

  /** Build a record describing "silence THIS finding here only". */
  static thisRecord(f: Finding): SilenceRecord {
    return {
      mode: 'this',
      category: f.category,
      titleKey: normalizeTitle(f.title),
      titleDisplay: f.title,
      file: f.file,
      startLine: f.range.startLine,
      endLine: f.range.endLine,
      dismissedAt: Date.now(),
    };
  }

  /** Build a record describing "silence this pattern wherever it appears". */
  static patternRecord(f: Finding): SilenceRecord {
    return {
      mode: 'pattern',
      category: f.category,
      titleKey: normalizeTitle(f.title),
      titleDisplay: f.title,
      dismissedAt: Date.now(),
    };
  }

  private async persist(): Promise<void> {
    await this.state.update(KEY, this.records);
    this._onChange.fire();
  }
}

/**
 * Title normalization: lowercase, strip punctuation/whitespace, keep first 60
 * chars. Goal is to match titles that mean the same thing even if Claude
 * phrased them slightly differently between runs ("Missing label" vs
 * "missing label!").
 */
export function normalizeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/^related:\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 60);
}

function matches(rule: SilenceRecord, f: Finding): boolean {
  if (rule.category !== f.category) return false;
  if (rule.titleKey !== normalizeTitle(f.title)) return false;
  if (rule.mode === 'pattern') return true;
  // 'this' mode — also require same file + overlapping line range (±3 lines)
  // to tolerate minor diff drift between runs without becoming pattern-wide.
  if (rule.file !== f.file) return false;
  if (rule.startLine == null || rule.endLine == null) return false;
  return rangesOverlap(rule.startLine, rule.endLine, f.range.startLine, f.range.endLine, 3);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number, slack: number): boolean {
  return aStart - slack <= bEnd && bStart - slack <= aEnd;
}

function sameKey(a: SilenceRecord, b: SilenceRecord): boolean {
  if (a.mode !== b.mode || a.category !== b.category || a.titleKey !== b.titleKey) return false;
  if (a.mode === 'pattern') return true;
  return a.file === b.file && a.startLine === b.startLine && a.endLine === b.endLine;
}

function isValid(r: any): r is SilenceRecord {
  return r && typeof r === 'object' &&
    (r.mode === 'this' || r.mode === 'pattern') &&
    typeof r.category === 'string' &&
    typeof r.titleKey === 'string';
}
