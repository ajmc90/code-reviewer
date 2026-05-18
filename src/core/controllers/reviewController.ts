import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { ReviewOrchestrator, ReviewPausedError } from '../orchestrator';
import { createReviewSessions } from '../orchestrator/sessionManager';
import { SampleStore } from '../estimator/sampleStore';
import { COEFFICIENTS_SCHEMA_VERSION } from '../estimator/coefficients';
import { ReviewPanel } from '../../ui/reviewPanel';
import { PassFailureDecision, PassName } from '../events/events';
import { Finding, PartialReviewState, PassConfig, ReviewOptions } from '../../types';
import { getLang } from '../../i18n';
import { ExtensionRuntime } from '../events/extensionContext';
import { loadPartial, savePartial } from '../stores/partialState';

function buildOrchestrator(
  rt: ExtensionRuntime,
  root: string,
  token: vscode.CancellationToken,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  extra: { resumeFrom?: PartialReviewState | null; restrictToPasses?: PassName[]; opts?: ReviewOptions } = {},
): ReviewOrchestrator {
  const cfg = vscode.workspace.getConfiguration('claudeReviewer');
  const useSessionReuse = cfg.get<boolean>('useSessionReuse', true);
  const sampleStore = new SampleStore(rt.ctx);
  return new ReviewOrchestrator({
    git: new GitService(root),
    cli: rt.buildCli(),
    workspaceRoot: root,
    log: rt.log,
    progress,
    token,
    model: cfg.get<string>('model', '') || undefined,
    cliTimeoutMs: cfg.get<number>('cliTimeoutMs', 600000),
    ignoreGlobs: cfg.get<string[]>('ignoreGlobs', []),
    contextExcludeGlobs: cfg.get<string[]>('contextExcludeGlobs', [
      '**/package-lock.json',
      '**/yarn.lock',
      '**/pnpm-lock.yaml',
      '**/Cargo.lock',
      '**/Gemfile.lock',
      '**/composer.lock',
      '**/poetry.lock',
      '**/__snapshots__/**',
      '**/*.snap',
    ]),
    contextFiles: cfg.get<string[]>('contextFiles', []),
    maxDiffBytes: cfg.get<number>('maxDiffBytes', 1500000),
    developerDiagnostics: cfg.get<boolean>('developerDiagnostics', false),
    // One pair of sessions per orchestrator instance (= per review). When the
    // setting is off, we omit sessions entirely so the CLI wrappers fall back
    // to spawning isolated processes (legacy behavior).
    sessions: useSessionReuse ? createReviewSessions() : undefined,
    events: rt.bus,
    resumeFrom: extra.resumeFrom ?? null,
    restrictToPasses: extra.restrictToPasses,
    onStateSnapshot: (s) => {
      void savePartial(rt.ctx.workspaceState, s).then(() => rt.broadcastPartialSummary());
    },
    requestPassDecision: (pass, error) =>
      new Promise<PassFailureDecision>((resolve) => {
        rt.pendingDecisions.set(pass, resolve);
        rt.bus.emit({ kind: 'passAwaitDecision', pass, error, at: Date.now() });
      }),
    // Persist per-review metrics to the sample store so the estimator can
    // calibrate over time. Skipped for resume/retry runs because they don't
    // execute the whole pipeline — recording a partial sample would skew
    // future predictions toward "reviews are cheaper than they really are."
    onReviewMetrics: extra.resumeFrom || extra.restrictToPasses?.length
      ? undefined
      : (summary) => {
          const reviewOpts = extra.opts;
          if (!reviewOpts) return;
          void sampleStore.recordSample({
            at: Date.now(),
            schemaVersion: COEFFICIENTS_SCHEMA_VERSION,
            rawDiffBytes: 0,  // populated below if available
            enrichedDiffBytes: summary.enrichedDiffBytes,
            linesAdded: 0,
            linesRemoved: 0,
            filesChanged: 0,
            passes: summary.passesRun as PassName[],
            depth: reviewOpts.depth,
            useSessionReuse,
            estimatedFindingsCount: 0,
            actualFindingsCount: summary.actualFindingsCount,
            totalTokens: summary.totalTokens,
            totalUsd: summary.totalUsd,
            totalDurationMs: summary.totalDurationMs,
            perPassUsd: summary.perPassUsd as Partial<Record<PassName, number>>,
          });
        },
  });
}

async function pickBranch(git: GitService, prompt: string, defaultBranch?: string): Promise<string | undefined> {
  const branches = await git.listBranches();
  const picks = branches.map((b) => ({ label: b, picked: b === defaultBranch }));
  const choice = await vscode.window.showQuickPick(picks, { placeHolder: prompt, matchOnDescription: true });
  return choice?.label;
}

export async function runReview(
  rt: ExtensionRuntime,
  panelDeps: any,
  opts: Partial<ReviewOptions> & { interactive?: boolean },
): Promise<void> {
  const root = rt.getWorkspaceRoot();
  if (!root) return;
  const git = new GitService(root);
  if (!(await git.isRepo())) {
    vscode.window.showErrorMessage(rt.tr('notif.notGitRepo'));
    return;
  }

  const cfg = vscode.workspace.getConfiguration('claudeReviewer');
  const configuredBase = cfg.get<string>('baseBranch', '');
  const detectedBase = configuredBase || (await git.detectDefaultBaseBranch());
  const head = opts.headBranch ?? (await git.currentBranch());

  let base = opts.baseBranch ?? detectedBase;
  if (opts.interactive) {
    const chosenBase = await pickBranch(git, rt.tr('notif.pickBase', { default: detectedBase }), detectedBase);
    if (!chosenBase) return;
    base = chosenBase;
    const chosenHead = await pickBranch(git, rt.tr('notif.pickHead', { default: head }), head);
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
    lang: getLang(rt.ctx),
  };

  await executeReviewLoop(rt, panelDeps, { root, opts: finalOpts });
}

/**
 * Shared loop that drives the orchestrator. Three entry points feed into it:
 *  - fresh review (opts only)
 *  - resume from saved partial state (resumeFrom)
 *  - retry a single failed/skipped pass (resumeFrom + restrictToPasses)
 */
export async function executeReviewLoop(
  rt: ExtensionRuntime,
  panelDeps: any,
  args: {
    root: string;
    opts?: ReviewOptions;
    resumeFrom?: PartialReviewState | null;
    restrictToPasses?: PassName[];
    titleSuffix?: string;
  },
): Promise<void> {
  const { root, resumeFrom, restrictToPasses } = args;
  const opts = args.opts ?? resumeFrom?.opts;
  if (!opts) {
    vscode.window.showErrorMessage(rt.tr('notif.noOptsOrState'));
    return;
  }

  rt.bus.reset();
  ReviewPanel.show(rt.ctx, rt.bus, panelDeps);

  // Fresh runs start from a clean slate so stale tree/decorations/panel data
  // don't leak. Resume/retry runs intentionally skip this.
  const isFreshRun = !resumeFrom && (!restrictToPasses || restrictToPasses.length === 0);
  if (isFreshRun) {
    await rt.setResult(null);
  }

  rt.broadcastPartialSummary();

  if (rt.state.currentReviewCts) {
    vscode.window.showWarningMessage(rt.tr('notif.reviewAlreadyRunning'));
    return;
  }
  const cts = new vscode.CancellationTokenSource();
  rt.state.currentReviewCts = cts;
  cts.token.onCancellationRequested(() => {
    for (const [, resolver] of rt.pendingDecisions) resolver('stop');
    rt.pendingDecisions.clear();
  });

  const title =
    (restrictToPasses && restrictToPasses.length
      ? rt.tr('title.retrying', { passes: restrictToPasses.join(', '), head: opts.headBranch })
      : resumeFrom
        ? rt.tr('title.resuming', { head: opts.headBranch })
        : rt.tr('title.reviewing', { head: opts.headBranch, base: opts.baseBranch })) + (args.titleSuffix ?? '');

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      async (progress, progressToken) => {
        progressToken.onCancellationRequested(() => cts.cancel());
        try {
          const orchestrator = buildOrchestrator(rt, root, cts.token, progress, { resumeFrom, restrictToPasses, opts });
          const result = await orchestrator.review(opts);
          await rt.setResult(result);
          if (!restrictToPasses || restrictToPasses.length === 0) {
            await savePartial(rt.ctx.workspaceState, null);
            rt.broadcastPartialSummary();
          }
          const sev = result.findings.reduce((acc: Record<string, number>, f: Finding) => {
            acc[f.severity] = (acc[f.severity] || 0) + 1;
            return acc;
          }, {});
          const openPanelLabel = rt.tr('notif.openPanel');
          const msg = rt.tr('notif.reviewDone', {
            verdict: result.summary.overallVerdict,
            critical: sev.critical || 0,
            major: sev.major || 0,
            minor: sev.minor || 0,
          });
          vscode.window.showInformationMessage(msg, openPanelLabel).then((pick) => {
            if (pick === openPanelLabel) vscode.commands.executeCommand('claudeReviewer.showPanel');
          });
        } catch (e: any) {
          if (e instanceof ReviewPausedError) {
            rt.log(`Review paused: ${e.state.pausedReason ?? '(unknown reason)'}`);
            const openPanelLabel = rt.tr('notif.openPanel');
            vscode.window
              .showWarningMessage(rt.tr('notif.reviewStoppedFailure'), openPanelLabel)
              .then((pick) => {
                if (pick === openPanelLabel) vscode.commands.executeCommand('claudeReviewer.showPanel');
              });
            return;
          }
          if ((e?.message ?? '').toLowerCase().includes('cancelled')) {
            rt.log('Review cancelled.');
            rt.bus.emit({ kind: 'cancelled', at: Date.now() });
            return;
          }
          rt.log(`Review failed: ${e?.stack ?? e?.message ?? e}`);
          rt.bus.emit({ kind: 'log', level: 'error', message: e?.message ?? String(e), at: Date.now() });
          vscode.window.showErrorMessage(rt.tr('notif.reviewFailed', { error: e?.message ?? String(e) }));
        }
      },
    );
  } finally {
    rt.state.currentReviewCts = null;
    cts.dispose();
    for (const [, resolver] of rt.pendingDecisions) resolver('stop');
    rt.pendingDecisions.clear();
    rt.broadcastPartialSummary();
  }
}

export { loadPartial };
