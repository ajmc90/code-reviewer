import * as fs from 'fs';
import * as path from 'path';
import { DiffFile } from '../types';

export interface FileContextEntry {
  path: string;
  content: string;
  reason?: string;
  truncated?: boolean;
}

/**
 * Token budget heuristic — Anthropic models are roughly 4 chars/token for English code.
 * We work in chars to avoid pulling a tokenizer dependency.
 */
export function charsForBudget(tokens: number): number {
  return Math.floor(tokens * 4);
}

/**
 * Loads the HEAD content of each changed file, prioritized by size (smallest first
 * fills more files into the budget), within a total char budget.
 *
 * Returns the entries actually loaded and the bytes remaining in the budget so
 * caller can spend the rest on related files from the structural pass.
 */
export function loadFullFilesForDiff(opts: {
  workspaceRoot: string;
  changedFiles: DiffFile[];
  budgetChars: number;
  perFileMaxChars?: number;
}): { entries: FileContextEntry[]; remainingChars: number } {
  const perFileCap = opts.perFileMaxChars ?? 40000;
  const entries: FileContextEntry[] = [];
  let used = 0;

  const candidates = opts.changedFiles
    .filter((f) => f.status !== 'deleted' && !f.binary)
    .map((f) => {
      const abs = path.join(opts.workspaceRoot, f.path);
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        size = -1;
      }
      return { file: f, abs, size };
    })
    .filter((c) => c.size >= 0)
    .sort((a, b) => a.size - b.size);

  for (const c of candidates) {
    const remaining = opts.budgetChars - used;
    if (remaining <= 200) break;
    let content: string;
    try {
      content = fs.readFileSync(c.abs, 'utf8');
    } catch {
      continue;
    }
    const cap = Math.min(perFileCap, remaining);
    let truncated = false;
    if (content.length > cap) {
      content = content.slice(0, cap) + `\n\n... (file truncated to ${cap} chars; original ${c.file.path} is ${c.size} bytes)`;
      truncated = true;
    }
    entries.push({
      path: c.file.path,
      content,
      reason: 'changed in diff',
      truncated,
    });
    used += content.length;
  }
  return { entries, remainingChars: opts.budgetChars - used };
}

/**
 * Loads extra related files (from the structural exploration pass) into the
 * remaining budget. Files already in `existingPaths` are skipped.
 */
export function loadRelatedFiles(opts: {
  workspaceRoot: string;
  requested: Array<{ path: string; reason?: string; lines?: string | null }>;
  existingPaths: Set<string>;
  budgetChars: number;
  perFileMaxChars?: number;
}): FileContextEntry[] {
  const perFileCap = opts.perFileMaxChars ?? 30000;
  const entries: FileContextEntry[] = [];
  let used = 0;
  for (const r of opts.requested) {
    if (!r.path) continue;
    if (opts.existingPaths.has(r.path)) continue;
    if (r.path.includes('..')) continue;
    const abs = path.join(opts.workspaceRoot, r.path);
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (r.lines) {
      content = sliceLines(content, r.lines);
    }
    const remaining = opts.budgetChars - used;
    if (remaining <= 200) break;
    const cap = Math.min(perFileCap, remaining);
    let truncated = false;
    if (content.length > cap) {
      content = content.slice(0, cap) + `\n\n... (file truncated to ${cap} chars)`;
      truncated = true;
    }
    entries.push({ path: r.path, content, reason: r.reason, truncated });
    used += content.length;
    opts.existingPaths.add(r.path);
  }
  return entries;
}

function sliceLines(content: string, range: string): string {
  const m = range.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return content;
  const start = Math.max(1, parseInt(m[1], 10));
  const end = Math.max(start, parseInt(m[2], 10));
  const lines = content.split('\n');
  const sliced = lines.slice(start - 1, end).map((line, idx) => `${start + idx}: ${line}`).join('\n');
  return `(lines ${start}-${end} of ${lines.length})\n${sliced}`;
}

const UI_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.svelte', '.html', '.htm', '.astro',
  '.css', '.scss', '.sass', '.less', '.styl', '.module.css',
]);

export function detectUiFiles(changed: DiffFile[]): string[] {
  return changed
    .filter((f) => {
      const ext = path.extname(f.path).toLowerCase();
      if (UI_EXTENSIONS.has(ext)) return true;
      // Tailwind config / global stylesheets
      if (/tailwind\.config\.(js|ts|cjs|mjs)$/.test(f.path)) return true;
      return false;
    })
    .map((f) => f.path);
}
