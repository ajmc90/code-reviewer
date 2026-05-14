import { extractJson } from './parser';

export interface StructuralExplorationResult {
  filesToInclude: Array<{ path: string; reason?: string; lines?: string | null }>;
  observedRisks: string[];
}

export function parseStructuralOutput(text: string): StructuralExplorationResult {
  const empty: StructuralExplorationResult = { filesToInclude: [], observedRisks: [] };
  const json = extractJson(text);
  if (!json) return empty;
  try {
    const raw = JSON.parse(json);
    return {
      filesToInclude: Array.isArray(raw.filesToInclude)
        ? raw.filesToInclude
            .map((x: any) => ({
              path: String(x?.path ?? '').trim(),
              reason: x?.reason ? String(x.reason) : undefined,
              lines: x?.lines ? String(x.lines) : null,
            }))
            .filter((x: any) => x.path)
        : [],
      observedRisks: Array.isArray(raw.observedRisks)
        ? raw.observedRisks.map((r: any) => String(r)).filter(Boolean).slice(0, 30)
        : [],
    };
  } catch {
    return empty;
  }
}
