import { shouldIgnore, stripExcludedFilesFromDiff } from '../../git/gitService';
import { buildContextSection } from '../../claude/prompts';
import { detectProjectContext, readConventions } from '../../context/projectContext';
import {
  loadFullFilesForDiff,
  detectUiFiles,
  charsForBudget,
  FileContextEntry,
} from '../../context/fileContext';
import { PartialReviewState, ReviewOptions } from '../../types';
import { PassName } from '../events';
import { OrchestratorDeps } from './types';
import { summarizeOversizedDiff } from './diffSummarizer';

export function buildEnrichedDiff(loadedFiles: FileContextEntry[], rawDiff: string): string {
  const contextSection = buildContextSection(loadedFiles);
  return contextSection ? `${contextSection}\n\n--- UNIFIED DIFF (base...head) ---\n${rawDiff}` : rawDiff;
}

export async function bootstrapState(
  deps: OrchestratorDeps,
  opts: ReviewOptions,
): Promise<PartialReviewState> {
  const { git, workspaceRoot, log, events } = deps;

  const ctx = await detectProjectContext(workspaceRoot);
  const conventions = readConventions(workspaceRoot, deps.contextFiles);
  log(`Detected languages: ${ctx.language.join(', ') || '(none)'}`);
  log(`Frameworks: ${ctx.frameworks.join(', ') || '(none)'}`);
  events?.emit({
    kind: 'context',
    languages: ctx.language,
    frameworks: ctx.frameworks,
    testFrameworks: ctx.testFrameworks,
    conventions: ctx.conventionsFiles,
    at: Date.now(),
  });

  await git.mergeBase(opts.baseBranch, opts.headBranch);

  const stat = await git.diffStat(opts.baseBranch, opts.headBranch);
  let rawDiff = await git.rawDiff(opts.baseBranch, opts.headBranch);
  let changedFiles = await git.parseDiffPerFile(opts.baseBranch, opts.headBranch);
  changedFiles = changedFiles.filter((f) => !shouldIgnore(f.path, deps.ignoreGlobs));

  if (changedFiles.length === 0) {
    throw new Error(`No changes between ${opts.baseBranch} and ${opts.headBranch}.`);
  }

  // Strip content of files matched by contextExcludeGlobs (lockfiles, snapshots,
  // generated locales) from the rawDiff that goes to the model. These files
  // still appear in changedFiles (the user sees them in the panel) but their
  // hunks are replaced with a one-line marker, saving cache_creation tokens
  // every pass.
  const excludedPaths = new Set(
    changedFiles
      .filter((f) => shouldIgnore(f.path, deps.contextExcludeGlobs))
      .map((f) => f.path),
  );
  if (excludedPaths.size > 0) {
    const before = rawDiff.length;
    rawDiff = stripExcludedFilesFromDiff(rawDiff, excludedPaths);
    log(`Context-excluded ${excludedPaths.size} file(s) from diff (${before} → ${rawDiff.length} chars): ${[...excludedPaths].slice(0, 5).join(', ')}${excludedPaths.size > 5 ? '…' : ''}`);
  }

  let truncated = false;
  if (rawDiff.length > deps.maxDiffBytes) {
    log(`Diff is large (${rawDiff.length} bytes). Chunking by file.`);
    rawDiff = summarizeOversizedDiff(changedFiles, deps.maxDiffBytes);
    truncated = true;
  }
  events?.emit({
    kind: 'diff',
    filesChanged: changedFiles.length,
    additions: stat.insertions,
    deletions: stat.deletions,
    truncated,
    at: Date.now(),
  });

  const totalBudgetChars = charsForBudget(60000);
  const diffBudgetReserved = Math.min(rawDiff.length, charsForBudget(40000));
  const contextBudget = Math.max(0, totalBudgetChars - diffBudgetReserved);
  let loadedFiles: FileContextEntry[] = [];
  if (contextBudget > 5000) {
    // Don't waste budget loading content for files we already excluded from
    // the diff — same logic, applied consistently.
    const loadableFiles = changedFiles.filter((f) => !excludedPaths.has(f.path));
    const loaded = loadFullFilesForDiff({ workspaceRoot, changedFiles: loadableFiles, budgetChars: contextBudget, perFileMaxChars: 40000 });
    loadedFiles = loaded.entries;
    log(`Loaded ${loadedFiles.length} changed-file contents (~${loadedFiles.reduce((a, f) => a + f.content.length, 0)} chars).`);
  }

  const enrichedDiff = buildEnrichedDiff(loadedFiles, rawDiff);
  log(`Enriched prompt context: ${loadedFiles.length} files, ${enrichedDiff.length} total chars.`);

  return {
    version: 1,
    opts,
    ctx,
    conventions,
    changedFiles,
    rawDiff,
    loadedFiles,
    enrichedDiff,
    structuralRisks: [],
    changeMap: [],
    stat,
    truncated,
    completedPasses: [],
    skippedPasses: [],
    findings: [],
    conditionalSkips: {},
    startedAt: Date.now(),
  };
}

export function hydrateForResume(
  deps: OrchestratorDeps,
  prev: PartialReviewState,
): PartialReviewState {
  const { events, log } = deps;
  events?.emit({
    kind: 'context',
    languages: prev.ctx.language,
    frameworks: prev.ctx.frameworks,
    testFrameworks: prev.ctx.testFrameworks,
    conventions: prev.ctx.conventionsFiles,
    at: Date.now(),
  });
  events?.emit({
    kind: 'diff',
    filesChanged: prev.changedFiles.length,
    additions: prev.stat.insertions,
    deletions: prev.stat.deletions,
    truncated: prev.truncated,
    at: Date.now(),
  });
  if (prev.changeMap.length > 0) {
    events?.emit({ kind: 'changeMap', entries: prev.changeMap, at: Date.now() });
  }
  for (const p of prev.completedPasses) {
    const findingCount = prev.findings.filter((f) => f.pass === p).length;
    events?.emit({ kind: 'passDone', pass: p as PassName, findingCount, durationMs: 0, at: Date.now() });
  }
  if (prev.lastConsolidation) {
    events?.emit({
      kind: 'consolidation',
      before: prev.lastConsolidation.before,
      after: prev.lastConsolidation.after,
      merged: prev.lastConsolidation.merged,
      at: Date.now(),
    });
  }
  if (prev.conditionalSkips) {
    for (const [pass, reason] of Object.entries(prev.conditionalSkips)) {
      if (reason) events?.emit({ kind: 'conditionalSkip', pass: pass as PassName, reason, at: Date.now() });
    }
  }
  // Re-emit findings so the panel rehydrates its right-side list.
  for (const f of prev.findings) {
    events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
  }
  log(`Resuming review: ${prev.completedPasses.length} passes complete, ${prev.skippedPasses.length} skipped, ${prev.findings.length} findings so far.`);
  // Shallow clone so mutations don't leak back to the saved snapshot.
  return {
    ...prev,
    changedFiles: [...prev.changedFiles],
    loadedFiles: [...prev.loadedFiles],
    completedPasses: [...prev.completedPasses],
    skippedPasses: [...prev.skippedPasses],
    structuralRisks: [...prev.structuralRisks],
    changeMap: [...prev.changeMap],
    findings: [...prev.findings],
    conditionalSkips: { ...(prev.conditionalSkips ?? {}) },
    pausedReason: undefined,
  };
}

/**
 * Compute the actual pass keys this run will execute, in execution order.
 * Mirrors the same gating logic the pass loop uses (user selection + depth +
 * UI-files heuristic for accessibility). Used to drive accurate UI progress
 * fractions and the paused banner's pending count.
 */
export function computePlannedPasses(state: PartialReviewState): string[] {
  const planned: string[] = [];
  const p = state.opts.passes;
  if (p.structural) planned.push('structural');
  if (p.explore) planned.push('explore');
  if (p.security) planned.push('security');
  if (p.performance) planned.push('performance');
  if (p.accessibility && detectUiFiles(state.changedFiles).length > 0) planned.push('accessibility');
  if (p.tests) planned.push('tests');
  if (p.gaps) planned.push('gaps');
  if (p.permute && (state.opts.depth === 'deep' || state.opts.depth === 'obsessive')) planned.push('permute');
  if (p.critique) planned.push('critique');
  return planned;
}
