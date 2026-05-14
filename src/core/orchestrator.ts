import * as vscode from 'vscode';
import { GitService, shouldIgnore } from '../git/gitService';
import { ClaudeCliClient } from '../claude/cliClient';
import {
  buildExplorePrompt,
  buildCritiquePrompt,
  buildPermutePrompt,
  buildSecurityPrompt,
  buildPerformancePrompt,
  buildTestsPrompt,
  buildSummaryPrompt,
  buildAccessibilityPrompt,
  buildGapsPrompt,
  buildStructuralExplorationPrompt,
  buildContextSection,
} from '../claude/prompts';
import { parseClaudeOutput, dedupeFindings } from '../claude/parser';
import { parseStructuralOutput } from '../claude/structuralParser';
import { detectProjectContext, readConventions } from '../context/projectContext';
import { loadFullFilesForDiff, loadRelatedFiles, detectUiFiles, charsForBudget, FileContextEntry } from '../context/fileContext';
import { Finding, PartialReviewState, ReviewOptions, ReviewResult, ReviewSummary, DiffFile } from '../types';
import { PassFailureDecision, ReviewEventBus, PassName } from './events';

/**
 * Thrown when the user picked "Stop" on a pass-failure prompt. Carries the
 * partial state so the extension can persist it and offer a Resume action.
 */
export class ReviewPausedError extends Error {
  constructor(public readonly state: PartialReviewState) {
    super('Review paused');
    this.name = 'ReviewPausedError';
  }
}

interface PlannedPass {
  pass: PassName;
  label: string;
  increment: number;
  condition: boolean;
  replaceAll?: boolean;
  /** Returns the findings for this pass (or [] if none). May throw on CLI failure. */
  run: () => Promise<Finding[]>;
}

export interface OrchestratorDeps {
  git: GitService;
  cli: ClaudeCliClient;
  workspaceRoot: string;
  log: (msg: string) => void;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  token?: vscode.CancellationToken;
  model?: string;
  cliTimeoutMs?: number;
  ignoreGlobs: string[];
  contextFiles: string[];
  maxDiffBytes: number;
  events?: ReviewEventBus;
  /**
   * If provided, resume from this snapshot instead of collecting context/diff
   * and re-running passes that already completed or were skipped.
   */
  resumeFrom?: PartialReviewState | null;
  /**
   * Called when a pass fails with a CLI error. Returning 'retry' loops the
   * pass, 'skip' moves on to the next, 'stop' halts and surfaces partial state
   * via ReviewPausedError. If omitted, defaults to 'stop'.
   */
  requestPassDecision?: (pass: PassName, error: string) => Promise<PassFailureDecision>;
  /**
   * Invoked after each completed/skipped pass with the latest partial state,
   * so the host can persist it for resume.
   */
  onStateSnapshot?: (state: PartialReviewState) => void;
  /**
   * If set, only run these passes (others are not even attempted). Used for
   * the per-step Retry affordance after the review stopped.
   */
  restrictToPasses?: PassName[];
}

export class ReviewOrchestrator {
  constructor(private deps: OrchestratorDeps) {}

  async review(opts: ReviewOptions): Promise<ReviewResult> {
    const start = Date.now();
    const { events } = this.deps;

    events?.emit({ kind: 'start', baseBranch: opts.baseBranch, headBranch: opts.headBranch, at: Date.now() });

    const state: PartialReviewState = this.deps.resumeFrom
      ? this.hydrateForResume(this.deps.resumeFrom)
      : await this.bootstrapState(opts);

    // Snapshot the freshly built state so even an immediate failure doesn't
    // force re-collecting context on retry.
    this.snapshot(state);

    await this.runRemainingPasses(state);

    this.report(this.deps.progress, 'Consolidating findings...', 5);
    const deduped = dedupeFindings(state.findings);

    this.report(this.deps.progress, 'Generating executive summary...', 5);
    events?.emit({ kind: 'passStart', pass: 'summary', label: 'Final summary', at: Date.now() });
    const summaryStart = Date.now();
    const summary = await this.makeSummary(state.opts, state.ctx, state.stat, deduped);
    events?.emit({ kind: 'passDone', pass: 'summary', findingCount: 0, durationMs: Date.now() - summaryStart, at: Date.now() });

    const result: ReviewResult = {
      summary: {
        ...summary,
        branch: state.opts.headBranch,
        baseBranch: state.opts.baseBranch,
        filesChanged: state.stat.filesChanged,
        linesAdded: state.stat.insertions,
        linesRemoved: state.stat.deletions,
      },
      findings: deduped,
      passesRun: [...state.completedPasses],
      durationMs: Date.now() - start,
    };
    events?.emit({
      kind: 'done',
      verdict: result.summary.overallVerdict,
      durationMs: result.durationMs,
      findingCount: deduped.length,
      at: Date.now(),
    });
    return result;
  }

  // ─── State construction ───────────────────────────────────────────

  private async bootstrapState(opts: ReviewOptions): Promise<PartialReviewState> {
    const { git, workspaceRoot, log, progress, events } = this.deps;

    this.report(progress, 'Detecting project context...', 2);
    const ctx = await detectProjectContext(workspaceRoot);
    const conventions = readConventions(workspaceRoot, this.deps.contextFiles);
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

    this.report(progress, 'Resolving merge base...', 3);
    await git.mergeBase(opts.baseBranch, opts.headBranch);

    this.report(progress, 'Collecting diff...', 5);
    const stat = await git.diffStat(opts.baseBranch, opts.headBranch);
    let rawDiff = await git.rawDiff(opts.baseBranch, opts.headBranch);
    let changedFiles = await git.parseDiffPerFile(opts.baseBranch, opts.headBranch);
    changedFiles = changedFiles.filter((f) => !shouldIgnore(f.path, this.deps.ignoreGlobs));

    if (changedFiles.length === 0) {
      throw new Error(`No changes between ${opts.baseBranch} and ${opts.headBranch}.`);
    }

    let truncated = false;
    if (rawDiff.length > this.deps.maxDiffBytes) {
      log(`Diff is large (${rawDiff.length} bytes). Chunking by file.`);
      rawDiff = this.summarizeOversizedDiff(changedFiles, this.deps.maxDiffBytes);
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

    // Always-on file context for changed files.
    const totalBudgetChars = charsForBudget(60000);
    const diffBudgetReserved = Math.min(rawDiff.length, charsForBudget(40000));
    const contextBudget = Math.max(0, totalBudgetChars - diffBudgetReserved);
    let loadedFiles: FileContextEntry[] = [];
    if (contextBudget > 5000) {
      const loaded = loadFullFilesForDiff({ workspaceRoot, changedFiles, budgetChars: contextBudget, perFileMaxChars: 40000 });
      loadedFiles = loaded.entries;
      log(`Loaded ${loadedFiles.length} changed-file contents (~${loadedFiles.reduce((a, f) => a + f.content.length, 0)} chars).`);
    }

    const enrichedDiff = this.buildEnrichedDiff(loadedFiles, rawDiff);
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
      stat,
      truncated,
      completedPasses: [],
      skippedPasses: [],
      findings: [],
      startedAt: Date.now(),
    };
  }

  private hydrateForResume(prev: PartialReviewState): PartialReviewState {
    const { events, log } = this.deps;
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
    for (const p of prev.completedPasses) {
      const findingCount = prev.findings.filter((f) => f.pass === p).length;
      events?.emit({ kind: 'passDone', pass: p as PassName, findingCount, durationMs: 0, at: Date.now() });
    }
    // Re-emit findings so the panel rehydrates its right-side list. Without
    // this the user only sees a count in the timeline; the findings grid would
    // stay empty until the resume runs to completion.
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
      findings: [...prev.findings],
      pausedReason: undefined,
    };
  }

  private buildEnrichedDiff(loadedFiles: FileContextEntry[], rawDiff: string): string {
    const contextSection = buildContextSection(loadedFiles);
    return contextSection ? `${contextSection}\n\n--- UNIFIED DIFF (base...head) ---\n${rawDiff}` : rawDiff;
  }

  private snapshot(state: PartialReviewState): void {
    this.deps.onStateSnapshot?.(state);
  }

  // ─── Pass loop ────────────────────────────────────────────────────

  private async runRemainingPasses(state: PartialReviewState): Promise<void> {
    if (state.opts.passes.structural && this.shouldRun('structural', state)) {
      await this.executePassWithDecisions('structural', 'Pass 0 — Structural exploration', 8, state, async () => {
        return await this.runStructuralPass(state);
      });
    }

    const planned: PlannedPass[] = [
      {
        pass: 'explore',
        label: 'Pass 1 — Exploration',
        increment: 10,
        condition: state.opts.passes.explore,
        run: () =>
          this.runFocusedPass('explore', () =>
            buildExplorePrompt({
              ctx: state.ctx,
              depth: state.opts.depth,
              baseBranch: state.opts.baseBranch,
              headBranch: state.opts.headBranch,
              diff: state.enrichedDiff,
              conventions: state.conventions,
              changedFiles: state.changedFiles,
              extraContext: '',
              structuralRisks: state.structuralRisks,
            }),
          'explore'),
      },
      {
        pass: 'security',
        label: 'Pass — Security',
        increment: 12,
        condition: state.opts.passes.security,
        run: () => this.runFocusedPass('security', () => buildSecurityPrompt({ ctx: state.ctx, diff: state.enrichedDiff }), 'security'),
      },
      {
        pass: 'performance',
        label: 'Pass — Performance',
        increment: 12,
        condition: state.opts.passes.performance,
        run: () => this.runFocusedPass('performance', () => buildPerformancePrompt({ ctx: state.ctx, diff: state.enrichedDiff }), 'performance'),
      },
      {
        pass: 'accessibility',
        label: 'Pass — Accessibility',
        increment: 10,
        condition: state.opts.passes.accessibility && detectUiFiles(state.changedFiles).length > 0,
        run: () =>
          this.runFocusedPass(
            'accessibility',
            () => buildAccessibilityPrompt({ ctx: state.ctx, diff: state.enrichedDiff, uiFiles: detectUiFiles(state.changedFiles) }),
            'accessibility',
          ),
      },
      {
        pass: 'tests',
        label: 'Pass — Tests',
        increment: 10,
        condition: state.opts.passes.tests,
        run: () => this.runFocusedPass('tests', () => buildTestsPrompt({ ctx: state.ctx, diff: state.enrichedDiff }), 'tests'),
      },
      {
        pass: 'gaps',
        label: 'Pass — Gaps (missing pieces)',
        increment: 10,
        condition: state.opts.passes.gaps,
        run: () =>
          this.runFocusedPass(
            'gaps',
            () => buildGapsPrompt({ ctx: state.ctx, diff: state.enrichedDiff, conventions: state.conventions, changedFiles: state.changedFiles }),
            'gaps',
          ),
      },
      {
        pass: 'permute',
        label: 'Pass — Permutation / Alternatives',
        increment: 10,
        condition: state.opts.passes.permute && (state.opts.depth === 'deep' || state.opts.depth === 'obsessive'),
        run: () =>
          this.runFocusedPass(
            'permute',
            () => buildPermutePrompt({ ctx: state.ctx, depth: state.opts.depth, diff: state.enrichedDiff }),
            'permute',
          ),
      },
      {
        pass: 'critique',
        label: 'Pass — Self-critique',
        increment: 8,
        condition: state.opts.passes.critique,
        replaceAll: true,
        run: () =>
          this.runFocusedPass(
            'critique',
            () =>
              buildCritiquePrompt({
                ctx: state.ctx,
                depth: state.opts.depth,
                priorFindingsJson: JSON.stringify(state.findings.map(stripIdForPrompt)),
                diff: state.enrichedDiff,
              }),
            'critique',
          ),
      },
    ];

    for (const step of planned) {
      if (!step.condition) continue;
      if (!this.shouldRun(step.pass, state)) continue;
      await this.executePassWithDecisions(step.pass, step.label, step.increment, state, async () => {
        const findings = await step.run();
        if (step.replaceAll && findings.length > 0) {
          state.findings.splice(0, state.findings.length, ...findings);
        } else {
          state.findings.push(...findings);
        }
        for (const f of findings) this.deps.events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
        return findings.length;
      });
    }
  }

  private shouldRun(pass: PassName, state: PartialReviewState): boolean {
    if (this.deps.restrictToPasses && !this.deps.restrictToPasses.includes(pass)) return false;
    if (state.completedPasses.includes(pass)) return false;
    if (state.skippedPasses.includes(pass)) return false;
    return true;
  }

  /**
   * Run one pass with retry/skip/stop semantics. On stop, throws
   * ReviewPausedError so the host can persist the partial state and offer
   * a Resume affordance. The `run` callback does the work and is responsible
   * for mutating `state` (appending findings, etc.); it returns the number of
   * findings for the passDone event.
   */
  private async executePassWithDecisions(
    pass: PassName,
    label: string,
    increment: number,
    state: PartialReviewState,
    run: () => Promise<number>,
  ): Promise<void> {
    const { events, token, progress, log } = this.deps;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.report(progress, label, increment);
      this.checkCancel(token);
      events?.emit({ kind: 'passStart', pass, label, at: Date.now() });
      const passStart = Date.now();
      try {
        const findingCount = await run();
        state.completedPasses.push(pass);
        this.snapshot(state);
        events?.emit({ kind: 'passDone', pass, findingCount, durationMs: Date.now() - passStart, at: Date.now() });
        return;
      } catch (e: any) {
        if (token?.isCancellationRequested) throw e;
        const errMsg = e?.message ?? String(e);
        log(`[${pass}] failed: ${errMsg}`);
        events?.emit({ kind: 'passError', pass, error: errMsg, at: Date.now() });

        const decide = this.deps.requestPassDecision;
        const decision: PassFailureDecision = decide ? await decide(pass, errMsg) : 'stop';
        events?.emit({ kind: 'passDecisionMade', pass, decision, at: Date.now() });

        if (decision === 'retry') {
          log(`[${pass}] retrying after user decision`);
          continue;
        }
        if (decision === 'skip') {
          state.skippedPasses.push(pass);
          this.snapshot(state);
          log(`[${pass}] skipped after user decision`);
          return;
        }
        // stop
        state.pausedReason = `${pass}: ${errMsg}`;
        this.snapshot(state);
        events?.emit({
          kind: 'paused',
          reason: state.pausedReason,
          completedPasses: [...state.completedPasses],
          skippedPasses: [...state.skippedPasses],
          findingCount: state.findings.length,
          at: Date.now(),
        });
        throw new ReviewPausedError(state);
      }
    }
  }

  private async runStructuralPass(state: PartialReviewState): Promise<number> {
    const { log, workspaceRoot } = this.deps;
    const prompt = buildStructuralExplorationPrompt({
      ctx: state.ctx,
      diff: state.rawDiff,
      changedFiles: state.changedFiles,
      conventions: state.conventions,
    });
    const text = await this.runCliWithTools(prompt, 'structural', ['Read', 'Grep', 'Glob']);
    const exploration = parseStructuralOutput(text);
    state.structuralRisks = exploration.observedRisks;
    log(`Structural pass: ${exploration.filesToInclude.length} extra files requested, ${exploration.observedRisks.length} risks observed.`);

    const usedBudget = state.loadedFiles.reduce((a, f) => a + f.content.length, 0);
    const totalBudgetChars = charsForBudget(60000);
    const diffBudgetReserved = Math.min(state.rawDiff.length, charsForBudget(40000));
    const contextBudget = Math.max(0, totalBudgetChars - diffBudgetReserved);
    const remainingChars = Math.max(0, contextBudget - usedBudget);
    const existingPaths = new Set(state.loadedFiles.map((f) => f.path));
    const related = loadRelatedFiles({
      workspaceRoot,
      requested: exploration.filesToInclude,
      existingPaths,
      budgetChars: remainingChars,
      perFileMaxChars: 30000,
    });
    state.loadedFiles.push(...related);
    log(`Structural pass added ${related.length} related files.`);
    state.enrichedDiff = this.buildEnrichedDiff(state.loadedFiles, state.rawDiff);
    return 0;
  }

  private async runFocusedPass(
    pass: PassName,
    buildPrompt: () => string,
    tag: Finding['pass'],
  ): Promise<Finding[]> {
    const { log, events } = this.deps;
    const prompt = buildPrompt();
    log(`[${pass}] prompt = ${prompt.length} chars (${Math.round(prompt.length / 1024)} KB)`);
    const text = await this.runCli(prompt, pass);
    log(`[${pass}] response = ${text.length} chars (${Math.round(text.length / 1024)} KB)`);
    const parsed = parseClaudeOutput(text);
    if (parsed.findings.length === 0 && text.length > 0) {
      const preview = text.trim().slice(0, 600).replace(/\s+/g, ' ');
      log(`[${pass}] parsed 0 findings. Response preview: ${preview}${text.length > 600 ? '…' : ''}`);
      events?.emit({
        kind: 'log',
        level: 'warn',
        message: `[${pass}] parsed 0 findings. First 200 chars: ${preview.slice(0, 200)}`,
        at: Date.now(),
      });
    }
    tagPass(parsed.findings, tag);
    return parsed.findings;
  }

  private async makeSummary(
    opts: ReviewOptions,
    ctx: import('../types').ProjectContext,
    stat: { filesChanged: number; insertions: number; deletions: number },
    findings: Finding[],
  ): Promise<ReviewSummary> {
    const prompt = buildSummaryPrompt({
      ctx,
      depth: opts.depth,
      allFindingsJson: JSON.stringify(findings.map(stripIdForPrompt)),
      diffStat: stat,
    });
    try {
      const text = await this.runCli(prompt, 'summary');
      const parsed = parseClaudeOutput(text);
      if (parsed.summary) return parsed.summary;
    } catch (e) {
      this.deps.log(`Summary pass failed, using fallback: ${(e as Error).message}`);
    }
    return this.fallbackSummary(findings);
  }

  private fallbackSummary(findings: Finding[]): ReviewSummary {
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const major = findings.filter((f) => f.severity === 'major').length;
    const verdict: ReviewSummary['overallVerdict'] = critical > 0 ? 'block' : major > 0 ? 'needs-changes' : 'approve-with-comments';
    return {
      branch: '',
      baseBranch: '',
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      overallVerdict: verdict,
      executiveSummary: `Review produced ${findings.length} findings across multiple passes.`,
      topConcerns: findings.filter((f) => f.severity === 'critical' || f.severity === 'major').slice(0, 6).map((f) => f.title),
      strengths: findings.filter((f) => f.severity === 'praise').slice(0, 3).map((f) => f.title),
      riskScore: Math.min(100, critical * 25 + major * 8 + findings.length),
      generatedAt: new Date().toISOString(),
    };
  }

  private summarizeOversizedDiff(files: DiffFile[], maxBytes: number): string {
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

  private async runCliWithTools(prompt: string, pass: PassName, allowedTools: string[]): Promise<string> {
    const events = this.deps.events;
    const r = await this.deps.cli.run(prompt, {
      cwd: this.deps.workspaceRoot,
      model: this.deps.model,
      timeoutMs: this.deps.cliTimeoutMs ?? 600000,
      allowedTools,
      onStderr: (s) => {
        this.deps.log(`[claude:${pass}:stderr] ${s.trim()}`);
        events?.emit({ kind: 'log', level: 'warn', message: s.trim(), at: Date.now() });
      },
      onStdout: (s) => {
        events?.emit({ kind: 'passOutput', pass, chunk: s, at: Date.now() });
      },
      signal: this.deps.token,
    });
    this.deps.log(`[claude:${pass}] ${r.text.length} chars in ${r.durationMs}ms (with tools: ${allowedTools.join(',')})`);
    return r.text;
  }

  private async runCli(prompt: string, pass: PassName): Promise<string> {
    const events = this.deps.events;
    const r = await this.deps.cli.run(prompt, {
      cwd: this.deps.workspaceRoot,
      model: this.deps.model,
      timeoutMs: this.deps.cliTimeoutMs ?? 600000,
      onStderr: (s) => {
        this.deps.log(`[claude:${pass}:stderr] ${s.trim()}`);
        events?.emit({ kind: 'log', level: 'warn', message: s.trim(), at: Date.now() });
      },
      onStdout: (s) => {
        events?.emit({ kind: 'passOutput', pass, chunk: s, at: Date.now() });
      },
      signal: this.deps.token,
    });
    this.deps.log(`[claude:${pass}] ${r.text.length} chars in ${r.durationMs}ms`);
    return r.text;
  }

  private report(p: vscode.Progress<any> | undefined, message: string, increment: number) {
    p?.report({ message, increment });
    this.deps.log(message);
  }

  private checkCancel(token: vscode.CancellationToken | undefined) {
    if (token?.isCancellationRequested) throw new Error('Cancelled');
  }
}

function tagPass(findings: Finding[], pass: Finding['pass']) {
  for (const f of findings) f.pass = pass;
}

function stripIdForPrompt(f: Finding): any {
  const { id, dismissed, ...rest } = f;
  return rest;
}

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
