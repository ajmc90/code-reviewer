import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { ReviewPanel } from '../ui/reviewPanel';
import { PartialReviewState } from '../types';
import { PassName } from '../core/events';
import { ExtensionRuntime } from '../core/extensionContext';
import { loadPartial, savePartial } from '../core/partialState';
import { runReview, executeReviewLoop } from '../core/reviewController';

export function registerReviewCommands(rt: ExtensionRuntime, panelDeps: any): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeReviewer.showPanel', () => {
      const panel = ReviewPanel.show(rt.ctx, rt.bus, panelDeps);
      if (rt.state.lastResult) panel.setResult(rt.state.lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.reviewBranch', () => {
      const panel = ReviewPanel.show(rt.ctx, rt.bus, panelDeps);
      if (rt.state.lastResult) panel.setResult(rt.state.lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.reviewCurrentBranch', () => runReview(rt, panelDeps, {})),
    vscode.commands.registerCommand('claudeReviewer.cancelReview', () => {
      if (!rt.state.currentReviewCts) {
        vscode.window.showInformationMessage(rt.tr('notif.noReviewRunning'));
        return;
      }
      rt.cancelCurrentReview();
    }),
    vscode.commands.registerCommand('claudeReviewer.resumeReview', async () => {
      const partial = loadPartial(rt.ctx.workspaceState, rt.log);
      if (!partial) {
        vscode.window.showInformationMessage(rt.tr('notif.noPausedToResume'));
        return;
      }
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      await executeReviewLoop(rt, panelDeps, { root, resumeFrom: partial });
    }),
    vscode.commands.registerCommand('claudeReviewer.retryPass', async (pass?: PassName) => {
      const partial = loadPartial(rt.ctx.workspaceState, rt.log);
      if (!partial) {
        vscode.window.showInformationMessage(rt.tr('notif.noPausedToRetry'));
        return;
      }
      if (!pass) {
        vscode.window.showWarningMessage(rt.tr('notif.passNameRequired'));
        return;
      }
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      const fresh: PartialReviewState = {
        ...partial,
        completedPasses: partial.completedPasses.filter((p) => p !== pass),
        skippedPasses: partial.skippedPasses.filter((p) => p !== pass),
        findings: partial.findings.filter((f) => f.pass !== pass),
        pausedReason: undefined,
      };
      await executeReviewLoop(rt, panelDeps, { root, resumeFrom: fresh, restrictToPasses: [pass] });
    }),
    vscode.commands.registerCommand('claudeReviewer.discardPartial', async () => {
      const partial = loadPartial(rt.ctx.workspaceState, rt.log);
      if (!partial) return;
      const discardLabel = rt.tr('notif.discardButton');
      const ok = await vscode.window.showWarningMessage(
        rt.tr('notif.discardPausedConfirm'),
        { modal: true },
        discardLabel,
      );
      if (ok !== discardLabel) return;
      await savePartial(rt.ctx.workspaceState, null);
      rt.broadcastPartialSummary();
    }),
    vscode.commands.registerCommand('claudeReviewer.reviewChangedFiles', async () => {
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      const git = new GitService(root);
      if (!(await git.isRepo())) {
        vscode.window.showErrorMessage(rt.tr('notif.notGitRepoShort'));
        return;
      }
      await runReview(rt, panelDeps, { baseBranch: 'HEAD', headBranch: 'HEAD' });
    }),
    vscode.commands.registerCommand('claudeReviewer.clearCache', async () => {
      await rt.setResult(null);
      vscode.window.showInformationMessage(rt.tr('notif.cacheCleared'));
    }),
  ];
}
