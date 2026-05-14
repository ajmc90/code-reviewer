import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitService } from './git/gitService';
import { ClaudeCliClient } from './claude/cliClient';
import { ReviewOrchestrator } from './core/orchestrator';
import { FindingsTreeProvider } from './ui/findingsTree';
import { SummaryViewProvider } from './ui/summaryView';
import { FindingsDecorator } from './ui/decorations';
import { ReviewPanel } from './ui/reviewPanel';
import { ReviewStatusBar } from './ui/statusBar';
import { ReviewEventBus } from './core/events';
import { Finding, PassConfig, ReviewOptions, ReviewResult } from './types';

const CACHE_KEY = 'claudeReviewer.lastResult';

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Claude Review', { log: true });
  const log = (m: string) => output.appendLine(m);

  const findingsTree = new FindingsTreeProvider();
  const summaryView = new SummaryViewProvider();
  const decorator = new FindingsDecorator();
  const bus = new ReviewEventBus();
  const statusBar = new ReviewStatusBar(bus);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeReviewer.findings', findingsTree),
    vscode.window.registerWebviewViewProvider(SummaryViewProvider.viewType, summaryView),
    decorator,
    statusBar,
    bus,
    output,
  );

  // The active review's cancellation source. Multiple UI affordances feed into it:
  // the progress notification's X, the panel's Stop button, and the
  // `claudeReviewer.cancelReview` command. Cleared when the review settles.
  let currentReviewCts: vscode.CancellationTokenSource | null = null;
  const cancelCurrentReview = () => {
    if (currentReviewCts) {
      log('Cancellation requested.');
      currentReviewCts.cancel();
    }
  };

  let lastResult: ReviewResult | null = context.workspaceState.get<ReviewResult>(CACHE_KEY) ?? null;
  if (lastResult) {
    findingsTree.setResult(lastResult);
    summaryView.setResult(lastResult);
    decorator.setFindings(lastResult.findings);
  }

  const setResult = async (r: ReviewResult | null) => {
    lastResult = r;
    await context.workspaceState.update(CACHE_KEY, r);
    findingsTree.setResult(r);
    summaryView.setResult(r);
    decorator.setFindings(r?.findings ?? []);
    ReviewPanel.currentInstance()?.setResult(r);
  };

  const panelDeps = {
    getGit: (): GitService | null => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return root ? new GitService(root) : null;
    },
    startReview: async (base: string, head: string, passes?: Partial<PassConfig>) => {
      await runReview({ baseBranch: base, headBranch: head, passes: passes as PassConfig | undefined });
    },
    cancelReview: () => cancelCurrentReview(),
  };

  const getWorkspaceRoot = (): string | null => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('Claude Review: open a folder first.');
      return null;
    }
    return folder.uri.fsPath;
  };

  const buildCli = (): ClaudeCliClient => {
    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    const cliPath = cfg.get<string>('claudeCliPath', 'claude');
    return new ClaudeCliClient(cliPath);
  };

  const buildOrchestrator = (root: string, token: vscode.CancellationToken, progress: vscode.Progress<{ message?: string; increment?: number }>) => {
    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    return new ReviewOrchestrator({
      git: new GitService(root),
      cli: buildCli(),
      workspaceRoot: root,
      log,
      progress,
      token,
      model: cfg.get<string>('model', '') || undefined,
      cliTimeoutMs: cfg.get<number>('cliTimeoutMs', 600000),
      ignoreGlobs: cfg.get<string[]>('ignoreGlobs', []),
      contextFiles: cfg.get<string[]>('contextFiles', []),
      maxDiffBytes: cfg.get<number>('maxDiffBytes', 1500000),
      events: bus,
    });
  };

  async function pickBranch(git: GitService, prompt: string, defaultBranch?: string): Promise<string | undefined> {
    const branches = await git.listBranches();
    const picks = branches.map((b) => ({ label: b, picked: b === defaultBranch }));
    const choice = await vscode.window.showQuickPick(picks, { placeHolder: prompt, matchOnDescription: true });
    return choice?.label;
  }

  async function runReview(opts: Partial<ReviewOptions> & { interactive?: boolean }) {
    const root = getWorkspaceRoot();
    if (!root) return;
    const git = new GitService(root);
    if (!(await git.isRepo())) {
      vscode.window.showErrorMessage('Claude Review: not a git repository.');
      return;
    }

    const cfg = vscode.workspace.getConfiguration('claudeReviewer');
    const configuredBase = cfg.get<string>('baseBranch', '');
    const detectedBase = configuredBase || (await git.detectDefaultBaseBranch());
    const head = opts.headBranch ?? (await git.currentBranch());

    let base = opts.baseBranch ?? detectedBase;
    if (opts.interactive) {
      const chosenBase = await pickBranch(git, `Base branch (default: ${detectedBase})`, detectedBase);
      if (!chosenBase) return;
      base = chosenBase;
      const chosenHead = await pickBranch(git, `Branch to review (default: ${head})`, head);
      if (!chosenHead) return;
      opts.headBranch = chosenHead;
    }

    const depth =
      opts.depth ??
      (cfg.get<'fast' | 'balanced' | 'deep' | 'obsessive'>('reasoningDepth', 'deep'));
    const passesCfg = cfg.get<Record<string, boolean>>('passes', {
      structural: true,
      explore: true,
      critique: true,
      permute: true,
      security: true,
      performance: true,
      tests: true,
      accessibility: true,
      gaps: true,
    });

    const overridePasses = (opts as { passes?: Partial<PassConfig> }).passes;
    const finalOpts: ReviewOptions = {
      baseBranch: base,
      headBranch: opts.headBranch ?? head,
      depth,
      passes: {
        structural: overridePasses?.structural ?? passesCfg.structural ?? true,
        explore: overridePasses?.explore ?? passesCfg.explore ?? true,
        critique: overridePasses?.critique ?? passesCfg.critique ?? true,
        permute: overridePasses?.permute ?? passesCfg.permute ?? true,
        security: overridePasses?.security ?? passesCfg.security ?? true,
        performance: overridePasses?.performance ?? passesCfg.performance ?? true,
        tests: overridePasses?.tests ?? passesCfg.tests ?? true,
        accessibility: overridePasses?.accessibility ?? passesCfg.accessibility ?? true,
        gaps: overridePasses?.gaps ?? passesCfg.gaps ?? true,
      },
      includeUntracked: opts.includeUntracked ?? cfg.get<boolean>('includeUntrackedFiles', false),
    };

    // Open the live panel before starting so the user sees streaming events.
    bus.reset();
    ReviewPanel.show(context, bus, panelDeps);

    if (currentReviewCts) {
      // A previous review is already running — refuse to start another so we
      // don't end up with two orchestrators racing on the same workspace.
      vscode.window.showWarningMessage(
        'A review is already running. Cancel it first (Stop button in the panel or "Claude Review: Cancel Running Review").',
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    currentReviewCts = cts;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Reviewing ${finalOpts.headBranch} vs ${finalOpts.baseBranch}`,
          cancellable: true,
        },
        async (progress, progressToken) => {
          // Bridge VS Code's progress-X token into our central CTS so any UI
          // affordance cancels the same operation.
          progressToken.onCancellationRequested(() => cts.cancel());
          try {
            const orchestrator = buildOrchestrator(root, cts.token, progress);
            const result = await orchestrator.review(finalOpts);
            await setResult(result);
            const sev = result.findings.reduce((acc: Record<string, number>, f: Finding) => {
              acc[f.severity] = (acc[f.severity] || 0) + 1;
              return acc;
            }, {});
            const msg = `Review done · verdict: ${result.summary.overallVerdict} · critical:${sev.critical || 0} major:${sev.major || 0} minor:${sev.minor || 0}`;
            vscode.window.showInformationMessage(msg, 'Open Panel').then((pick) => {
              if (pick === 'Open Panel') vscode.commands.executeCommand('claudeReviewer.showPanel');
            });
          } catch (e: any) {
            if ((e?.message ?? '').toLowerCase().includes('cancelled')) {
              log('Review cancelled.');
              bus.emit({ kind: 'cancelled', at: Date.now() });
              return;
            }
            log(`Review failed: ${e?.stack ?? e?.message ?? e}`);
            bus.emit({ kind: 'log', level: 'error', message: e?.message ?? String(e), at: Date.now() });
            vscode.window.showErrorMessage(`Claude Review failed: ${e?.message ?? e}`);
          }
        },
      );
    } finally {
      currentReviewCts = null;
      cts.dispose();
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeReviewer.showPanel', () => {
      const panel = ReviewPanel.show(context, bus, panelDeps);
      if (lastResult) panel.setResult(lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.reviewBranch', () => {
      const panel = ReviewPanel.show(context, bus, panelDeps);
      if (lastResult) panel.setResult(lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.reviewCurrentBranch', () => runReview({})),
    vscode.commands.registerCommand('claudeReviewer.cancelReview', () => {
      if (!currentReviewCts) {
        vscode.window.showInformationMessage('No review is currently running.');
        return;
      }
      cancelCurrentReview();
    }),
    vscode.commands.registerCommand('claudeReviewer.reviewChangedFiles', async () => {
      // Compare HEAD against working tree by diffing HEAD against itself with --no-index style.
      const root = getWorkspaceRoot();
      if (!root) return;
      const git = new GitService(root);
      if (!(await git.isRepo())) {
        vscode.window.showErrorMessage('Not a git repository.');
        return;
      }
      // Use working-tree diff: head=working tree (empty-string sentinel) vs HEAD
      await runReview({ baseBranch: 'HEAD', headBranch: 'HEAD' }); // placeholder; users typically want branch flow
    }),
    vscode.commands.registerCommand('claudeReviewer.openFinding', async (idOrFinding: string | Finding) => {
      const finding =
        typeof idOrFinding === 'string'
          ? lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding) return;
      const root = getWorkspaceRoot();
      if (!root) return;
      const fileUri = vscode.Uri.file(path.join(root, finding.file));
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc);
        const startLine = Math.max(0, finding.range.startLine - 1);
        const endLine = Math.max(startLine, finding.range.endLine - 1);
        const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(Math.min(endLine, doc.lineCount - 1)).text.length);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Could not open ${finding.file}: ${e?.message ?? e}`);
      }
    }),
    vscode.commands.registerCommand('claudeReviewer.applyFix', async (idOrFinding: string | Finding) => {
      const finding =
        typeof idOrFinding === 'string'
          ? lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding?.suggestedFix) {
        vscode.window.showWarningMessage('This finding has no suggested fix.');
        return;
      }
      const root = getWorkspaceRoot();
      if (!root) return;
      const fileUri = vscode.Uri.file(path.join(root, finding.file));
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const startLine = Math.max(0, finding.range.startLine - 1);
      const endLine = Math.max(startLine, finding.range.endLine - 1);
      const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(Math.min(endLine, doc.lineCount - 1)).text.length);
      const ok = await vscode.window.showInformationMessage(
        `Apply Claude's suggested fix to ${finding.file}:${finding.range.startLine}-${finding.range.endLine}?`,
        { modal: true },
        'Apply',
      );
      if (ok !== 'Apply') return;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(fileUri, range, finding.suggestedFix.replacement);
      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        await doc.save();
        vscode.window.showInformationMessage('Fix applied.');
      } else {
        vscode.window.showErrorMessage('Could not apply fix.');
      }
    }),
    vscode.commands.registerCommand('claudeReviewer.dismissFinding', async (idOrFinding: string | Finding) => {
      if (!lastResult) return;
      const id = typeof idOrFinding === 'string' ? idOrFinding : idOrFinding.id;
      const target = lastResult.findings.find((f) => f.id === id);
      if (!target) return;
      target.dismissed = true;
      await setResult(lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.askFollowUp', async (idOrFinding: string | Finding) => {
      const finding =
        typeof idOrFinding === 'string'
          ? lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding) return;
      const root = getWorkspaceRoot();
      if (!root) return;
      const question = await vscode.window.showInputBox({
        prompt: `Follow-up about ${finding.title}`,
        placeHolder: 'e.g. "Show me how this would fail under concurrent calls."',
      });
      if (!question) return;
      const cli = buildCli();
      const cfg = vscode.workspace.getConfiguration('claudeReviewer');
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Asking Claude...', cancellable: true },
        async (_p, token) => {
          try {
            const prompt = [
              'You previously raised this code-review finding:',
              JSON.stringify(stripFinding(finding), null, 2),
              '',
              'The reviewer is asking a follow-up question. Answer concisely in markdown:',
              question,
            ].join('\n');
            const r = await cli.run(prompt, {
              cwd: root,
              model: cfg.get<string>('model', '') || undefined,
              timeoutMs: cfg.get<number>('cliTimeoutMs', 600000),
              signal: token,
            });
            const panel = vscode.window.createWebviewPanel(
              'claudeReviewer.followUp',
              `Follow-up: ${finding.title}`,
              vscode.ViewColumn.Beside,
              { enableScripts: false },
            );
            panel.webview.html = `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:14px;line-height:1.5"><h2>${escapeHtml(finding.title)}</h2><p><b>Your question:</b> ${escapeHtml(question)}</p><hr/><pre style="white-space:pre-wrap">${escapeHtml(r.text)}</pre></body></html>`;
          } catch (e: any) {
            vscode.window.showErrorMessage(`Follow-up failed: ${e?.message ?? e}`);
          }
        },
      );
    }),
    vscode.commands.registerCommand('claudeReviewer.exportReport', async () => {
      if (!lastResult) {
        vscode.window.showInformationMessage('No review to export. Run one first.');
        return;
      }
      const root = getWorkspaceRoot();
      if (!root) return;
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(root, `claude-review-${Date.now()}.md`)),
        filters: { Markdown: ['md'] },
      });
      if (!target) return;
      const md = renderReportMarkdown(lastResult);
      fs.writeFileSync(target.fsPath, md, 'utf8');
      vscode.window.showInformationMessage(`Report saved: ${target.fsPath}`);
    }),
    vscode.commands.registerCommand('claudeReviewer.clearCache', async () => {
      await setResult(null);
      vscode.window.showInformationMessage('Claude Review cache cleared.');
    }),
  );
}

export function deactivate() {}

function stripFinding(f: Finding): any {
  const { id, dismissed, ...rest } = f;
  return rest;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderReportMarkdown(r: ReviewResult): string {
  const lines: string[] = [];
  const s = r.summary;
  lines.push(`# Claude Code Review`);
  lines.push('');
  lines.push(`**Branch:** \`${s.branch}\` vs \`${s.baseBranch}\``);
  lines.push(`**Verdict:** ${s.overallVerdict}`);
  lines.push(`**Files changed:** ${s.filesChanged} · **+${s.linesAdded} / -${s.linesRemoved}**`);
  lines.push(`**Risk score:** ${s.riskScore}/100`);
  lines.push(`**Passes run:** ${r.passesRun.join(', ')}`);
  lines.push('');
  lines.push(`## Executive summary`);
  lines.push(s.executiveSummary);
  lines.push('');
  if (s.topConcerns.length) {
    lines.push(`## Top concerns`);
    for (const c of s.topConcerns) lines.push(`- ${c}`);
    lines.push('');
  }
  if (s.strengths.length) {
    lines.push(`## Strengths`);
    for (const c of s.strengths) lines.push(`- ${c}`);
    lines.push('');
  }
  lines.push(`## Findings (${r.findings.length})`);
  for (const f of r.findings) {
    lines.push('');
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`*${f.file}:${f.range.startLine}-${f.range.endLine}* · category: \`${f.category}\` · confidence: \`${f.confidence}\` · pass: \`${f.pass}\``);
    lines.push('');
    lines.push(f.description);
    if (f.reasoning) {
      lines.push('');
      lines.push(`**Reasoning**`);
      lines.push(f.reasoning);
    }
    if (f.questionsRaised.length) {
      lines.push('');
      lines.push(`**Questions raised**`);
      for (const q of f.questionsRaised) lines.push(`- ${q}`);
    }
    if (f.alternativesConsidered.length) {
      lines.push('');
      lines.push(`**Alternatives considered**`);
      for (const a of f.alternativesConsidered) lines.push(`- ${a}`);
    }
    if (f.evidence.length) {
      lines.push('');
      lines.push(`**Evidence**`);
      for (const e of f.evidence) lines.push(`> ${e.replace(/\n/g, '\n> ')}`);
    }
    if (f.suggestedFix) {
      lines.push('');
      lines.push(`**Suggested fix** (confidence: ${f.suggestedFix.confidence})`);
      lines.push(f.suggestedFix.description);
      lines.push('```');
      lines.push(f.suggestedFix.replacement);
      lines.push('```');
    }
  }
  return lines.join('\n');
}
