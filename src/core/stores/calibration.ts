import * as vscode from 'vscode';
import type { PassName } from '../events/events';

/**
 * Self-calibrating runtime estimator.
 *
 * Each completed pass contributes a (durationMs, diffSize) sample. We keep up
 * to MAX_SAMPLES per pass in two scopes:
 *   - workspaceState — narrowly fits this codebase (e.g. Rust-heavy repo)
 *   - globalState    — broad fallback that captures model + machine speed
 *
 * Estimation picks workspace samples when there are at least MIN_WORKSPACE,
 * otherwise falls back to global, otherwise to the caller-provided defaults.
 */

const KEY = 'claudeReviewer.calibration';
const MAX_SAMPLES = 12;
const MIN_WORKSPACE = 3;
// Effective minimum we treat as a "tiny diff" so the per-line ratio doesn't
// explode into Infinity for empty changes (typo fixes, doc-only edits).
const MIN_DIFF_SIZE = 25;

export interface PassSample {
  /** Wall-clock duration in ms for one pass invocation. */
  durationMs: number;
  /** additions + deletions at run time. */
  diffSize: number;
  /** Captured for future filtering; unused today. */
  at: number;
}

export interface CalibrationProfile {
  // Per-pass arrays of samples. Bounded length, oldest-first.
  samples: Partial<Record<PassName, PassSample[]>>;
}

function emptyProfile(): CalibrationProfile {
  return { samples: {} };
}

function readScope(memento: vscode.Memento): CalibrationProfile {
  const raw = memento.get<CalibrationProfile>(KEY);
  if (!raw || typeof raw !== 'object' || !raw.samples) return emptyProfile();
  return raw;
}

async function writeScope(memento: vscode.Memento, profile: CalibrationProfile): Promise<void> {
  await memento.update(KEY, profile);
}

export async function recordPassSample(
  ctx: vscode.ExtensionContext,
  pass: PassName,
  durationMs: number,
  diffSize: number,
): Promise<void> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const sample: PassSample = {
    durationMs: Math.round(durationMs),
    diffSize: Math.max(MIN_DIFF_SIZE, Math.round(diffSize)),
    at: Date.now(),
  };
  const append = (profile: CalibrationProfile): CalibrationProfile => {
    const list = profile.samples[pass] ? [...profile.samples[pass]!] : [];
    list.push(sample);
    while (list.length > MAX_SAMPLES) list.shift();
    return { samples: { ...profile.samples, [pass]: list } };
  };
  await writeScope(ctx.workspaceState, append(readScope(ctx.workspaceState)));
  await writeScope(ctx.globalState, append(readScope(ctx.globalState)));
}

/** Combined profile: workspace samples + global samples per pass. */
export interface ResolvedCalibration {
  /** Median ms-per-line ratio per pass when we have enough data. */
  ratios: Partial<Record<PassName, { medianMsPerLine: number; sampleCount: number; scope: 'workspace' | 'global' }>>;
}

export function loadCalibration(ctx: vscode.ExtensionContext): ResolvedCalibration {
  const ws = readScope(ctx.workspaceState);
  const gl = readScope(ctx.globalState);
  const ratios: ResolvedCalibration['ratios'] = {};

  const allPasses = new Set<PassName>([
    ...(Object.keys(ws.samples) as PassName[]),
    ...(Object.keys(gl.samples) as PassName[]),
  ]);

  for (const pass of allPasses) {
    const wsSamples = ws.samples[pass] ?? [];
    const glSamples = gl.samples[pass] ?? [];
    let chosen: PassSample[];
    let scope: 'workspace' | 'global';
    if (wsSamples.length >= MIN_WORKSPACE) {
      chosen = wsSamples;
      scope = 'workspace';
    } else if (glSamples.length > 0) {
      chosen = glSamples;
      scope = 'global';
    } else {
      continue;
    }
    const median = medianMsPerLine(chosen);
    if (median > 0) {
      ratios[pass] = { medianMsPerLine: median, sampleCount: chosen.length, scope };
    }
  }
  return { ratios };
}

function medianMsPerLine(samples: PassSample[]): number {
  const ratios = samples
    .map((s) => s.durationMs / Math.max(MIN_DIFF_SIZE, s.diffSize))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return 0;
  const mid = ratios.length >> 1;
  return ratios.length % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];
}
