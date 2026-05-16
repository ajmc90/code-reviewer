import { DiffFile } from '../../types';

function renderFileForPrompt(f: DiffFile): string {
  const head = `\n=== ${f.path} (${f.status}, +${f.additions} -${f.deletions}) ===\n`;
  const hunks = f.hunks
    .map(
      (h) =>
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@ ${h.header}\n${h.lines.join('\n')}`,
    )
    .join('\n');
  return head + hunks;
}

export function summarizeOversizedDiff(files: DiffFile[], maxBytes: number): string {
  const sorted = [...files].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
  const parts: string[] = [];
  let total = 0;
  for (const f of sorted) {
    const segment = renderFileForPrompt(f);
    if (total + segment.length > maxBytes) {
      parts.push(`\n--- diff truncated: ${sorted.length - parts.length} more files omitted ---`);
      break;
    }
    parts.push(segment);
    total += segment.length;
  }
  return parts.join('\n');
}
