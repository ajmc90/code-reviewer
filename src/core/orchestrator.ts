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
import { Finding, ReviewOptions, ReviewResult, ReviewSummary, DiffFile } from '../types';
import { ReviewEventBus, PassName } from './events';

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
}

export class ReviewOrchestrator {
  constructor(private deps: OrchestratorDeps) {}

  async review(opts: ReviewOptions): Promise<ReviewResult> {
    const start = Date.now();
    const { git, cli, workspaceRoot, log, progress, token, events } = this.deps;

    events?.emit({ kind: 'start', baseBranch: opts.baseBranch, headBranch: opts.headBranch, at: Date.now() });

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

    const passes: string[] = [];
    const passFindings: Finding[] = [];

    // ─── Build extra file context (always) ──────────────────────────
    // Pull full HEAD content of changed files into the prompt so reviewers
    // see the surrounding code, not just the hunk. Token budget is generous;
    // file-context loader truncates by file size, prioritizing small files.
    const totalBudgetChars = charsForBudget(60000); // ~240KB across all extra context
    const diffBudgetReserved = Math.min(rawDiff.length, charsForBudget(40000));
    const contextBudget = Math.max(0, totalBudgetChars - diffBudgetReserved);
    let loadedFiles: FileContextEntry[] = [];
    if (contextBudget > 5000) {
      const loaded = loadFullFilesForDiff({
        workspaceRoot,
        changedFiles,
        budgetChars: contextBudget,
        perFileMaxChars: 40000,
      });
      loadedFiles = loaded.entries;
      log(`Loaded ${loadedFiles.length} changed-file contents (~${loadedFiles.reduce((a, f) => a + f.content.length, 0)} chars).`);
    }

    // ─── Structural exploration pass (optional) ─────────────────────
    let structuralRisks: string[] = [];
    if (opts.passes.structural) {
      this.report(progress, 'Pass 0 — Structural exploration…', 8);
      this.checkCancel(token);
      events?.emit({ kind: 'passStart', pass: 'structural', label: 'Pass 0 — Structural exploration', at: Date.now() });
      const passStart = Date.now();
      try {
        const prompt = buildStructuralExplorationPrompt({ ctx, diff: rawDiff, changedFiles, conventions });
        const text = await this.runCliWithTools(prompt, 'structural', ['Read', 'Grep', 'Glob']);
        const exploration = parseStructuralOutput(text);
        structuralRisks = exploration.observedRisks;
        log(`Structural pass: ${exploration.filesToInclude.length} extra files requested, ${exploration.observedRisks.length} risks observed.`);

        // Load the requested related files into the remaining context budget
        const remainingChars = Math.max(0, contextBudget - loadedFiles.reduce((a, f) => a + f.content.length, 0));
        const existingPaths = new Set(loadedFiles.map((f) => f.path));
        const related = loadRelatedFiles({
          workspaceRoot,
          requested: exploration.filesToInclude,
          existingPaths,
          budgetChars: remainingChars,
          perFileMaxChars: 30000,
        });
        loadedFiles.push(...related);
        log(`Structural pass added ${related.length} related files.`);

        passes.push('structural');
        events?.emit({ kind: 'passDone', pass: 'structural', findingCount: 0, durationMs: Date.now() - passStart, at: Date.now() });
      } catch (e: any) {
        events?.emit({ kind: 'passError', pass: 'structural', error: e?.message ?? String(e), at: Date.now() });
        // structural is best-effort — don't fail the whole review on it
        log(`Structural pass failed (continuing without it): ${e?.message ?? e}`);
      }
    }

    // Build the enriched diff that every focused pass sees: file context + raw diff
    const contextSection = buildContextSection(loadedFiles);
    const enrichedDiff = contextSection ? `${contextSection}\n\n--- UNIFIED DIFF (base...head) ---\n${rawDiff}` : rawDiff;
    log(`Enriched prompt context: ${loadedFiles.length} files, ${enrichedDiff.length} total chars.`);

    const runPass = async (
      pass: PassName,
      label: string,
      increment: number,
      buildPrompt: () => string,
      tag: Finding['pass'],
      replaceAll = false,
    ) => {
      this.report(progress, label, increment);
      this.checkCancel(token);
      events?.emit({ kind: 'passStart', pass, label, at: Date.now() });
      const passStart = Date.now();
      const prompt = buildPrompt();
      log(`[${pass}] prompt = ${prompt.length} chars (${Math.round(prompt.length / 1024)} KB)`);
      try {
        const text = await this.runCli(prompt, pass);
        log(`[${pass}] response = ${text.length} chars (${Math.round(text.length / 1024)} KB)`);
        const parsed = parseClaudeOutput(text);
        if (parsed.findings.length === 0 && text.length > 0) {
          // No findings but Claude DID respond — likely a parse problem or
          // an honest "nothing to flag" answer. Show the first 600 chars of
          // the raw response so the user can tell which.
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
        if (replaceAll && parsed.findings.length > 0) {
          passFindings.splice(0, passFindings.length, ...parsed.findings);
        } else {
          passFindings.push(...parsed.findings);
        }
        for (const f of parsed.findings) {
          events?.emit({ kind: 'findingAdded', finding: f, at: Date.now() });
        }
        passes.push(pass);
        events?.emit({ kind: 'passDone', pass, findingCount: parsed.findings.length, durationMs: Date.now() - passStart, at: Date.now() });
        log(`${label} produced ${parsed.findings.length} findings (${Date.now() - passStart}ms).`);
      } catch (e: any) {
        events?.emit({ kind: 'passError', pass, error: e?.message ?? String(e), at: Date.now() });
        throw e;
      }
    };

    if (opts.passes.explore) {
      await runPass(
        'explore',
        'Pass 1 — Exploration',
        10,
        () =>
          buildExplorePrompt({
            ctx,
            depth: opts.depth,
            baseBranch: opts.baseBranch,
            headBranch: opts.headBranch,
            diff: enrichedDiff,
            conventions,
            changedFiles,
            extraContext: '', // already in enrichedDiff
            structuralRisks,
          }),
        'explore',
      );
    }
    if (opts.passes.security) {
      await runPass('security', 'Pass — Security', 12, () => buildSecurityPrompt({ ctx, diff: enrichedDiff }), 'security');
    }
    if (opts.passes.performance) {
      await runPass('performance', 'Pass — Performance', 12, () => buildPerformancePrompt({ ctx, diff: enrichedDiff }), 'performance');
    }
    const uiFiles = detectUiFiles(changedFiles);
    if (opts.passes.accessibility && uiFiles.length > 0) {
      await runPass(
        'accessibility',
        'Pass — Accessibility',
        10,
        () => buildAccessibilityPrompt({ ctx, diff: enrichedDiff, uiFiles }),
        'accessibility',
      );
    } else if (opts.passes.accessibility) {
      log('Accessibility pass skipped: no UI/CSS files in the diff.');
    }
    if (opts.passes.tests) {
      await runPass('tests', 'Pass — Tests', 10, () => buildTestsPrompt({ ctx, diff: enrichedDiff }), 'tests');
    }
    if (opts.passes.gaps) {
      await runPass(
        'gaps',
        'Pass — Gaps (missing pieces)',
        10,
        () => buildGapsPrompt({ ctx, diff: enrichedDiff, conventions, changedFiles }),
        'gaps',
      );
    }
    if (opts.passes.permute && (opts.depth === 'deep' || opts.depth === 'obsessive')) {
      await runPass(
        'permute',
        'Pass — Permutation / Alternatives',
        10,
        () => buildPermutePrompt({ ctx, depth: opts.depth, diff: enrichedDiff }),
        'permute',
      );
    }
    if (opts.passes.critique) {
      await runPass(
        'critique',
        'Pass — Self-critique',
        8,
        () =>
          buildCritiquePrompt({
            ctx,
            depth: opts.depth,
            priorFindingsJson: JSON.stringify(passFindings.map(stripIdForPrompt)),
            diff: enrichedDiff,
          }),
        'critique',
        true,
      );
    }

    this.report(progress, 'Consolidating findings...', 5);
    const deduped = dedupeFindings(passFindings);

    this.report(progress, 'Generating executive summary...', 5);
    events?.emit({ kind: 'passStart', pass: 'summary', label: 'Final summary', at: Date.now() });
    const summaryStart = Date.now();
    const summary = await this.makeSummary(opts, ctx, stat, deduped);
    events?.emit({ kind: 'passDone', pass: 'summary', findingCount: 0, durationMs: Date.now() - summaryStart, at: Date.now() });

    const result: ReviewResult = {
      summary: {
        ...summary,
        branch: opts.headBranch,
        baseBranch: opts.baseBranch,
        filesChanged: stat.filesChanged,
        linesAdded: stat.insertions,
        linesRemoved: stat.deletions,
      },
      findings: deduped,
      passesRun: passes,
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
