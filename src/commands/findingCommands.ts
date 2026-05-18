import * as vscode from 'vscode';
import * as path from 'path';
import { Finding } from '../types';
import { FixPreviewProvider, openFixDiff } from '../ui/fixPreview';
import { SilenceStore } from '../core/silenceStore';
import { getLang } from '../i18n';
import { ExtensionRuntime } from '../core/extensionContext';
import { GitService } from '../git/gitService';

function stripFinding(f: Finding): any {
  const { id, dismissed, translations, displayLang, originalLang, ...rest } = f;
  return rest;
}

export function registerFindingCommands(rt: ExtensionRuntime): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeReviewer.openPath', async (relPath: string) => {
      const root = rt.getWorkspaceRoot();
      if (!root || !relPath) return;
      const fileUri = vscode.Uri.file(path.join(root, relPath));
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
      } catch (e: any) {
        vscode.window.showErrorMessage(rt.tr('notif.couldNotOpen', { file: relPath, error: e?.message ?? String(e) }));
      }
    }),
    vscode.commands.registerCommand('claudeReviewer.openFinding', async (idOrFinding: string | Finding) => {
      const finding =
        typeof idOrFinding === 'string'
          ? rt.state.lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding) return;
      const root = rt.getWorkspaceRoot();
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
        vscode.window.showErrorMessage(rt.tr('notif.couldNotOpen', { file: finding.file, error: e?.message ?? String(e) }));
      }
    }),
    vscode.commands.registerCommand('claudeReviewer.applyFix', async (idOrFinding: string | Finding) => {
      // Resolve the finding from either path: full payload (current panel —
      // works during streaming) or id lookup against lastResult (legacy
      // callers, e.g. the tree view or hover commands). The two error cases
      // need distinct messages: a missing finding usually means the review
      // hasn't finished or the user is acting on a stale id, while a finding
      // present-but-without-suggestedFix is a genuine "model didn't propose
      // one" — same word in the UI would mislead.
      const finding =
        typeof idOrFinding === 'string'
          ? rt.state.lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding) {
        vscode.window.showWarningMessage(rt.tr('notif.findingNotAvailable'));
        return;
      }
      if (!finding.suggestedFix) {
        vscode.window.showWarningMessage(rt.tr('notif.noSuggestedFix'));
        return;
      }
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      const opened = await openFixDiff(finding, root, rt.fixPreview);
      // The applier refuses to write when it can't cleanly apply the fix.
      // Three failure outcomes, each with a different actionable message:
      //   - already-applied : the fix is in the file already (or you're on a
      //                       different branch than the one reviewed). Offer
      //                       to switch to the review branch.
      //   - ambiguous       : oldString matches >1 place. Open the file so
      //                       the user can pick.
      //   - no-match        : the model's snapshot diverged from disk in a
      //                       way the cascade couldn't recover. Same affordance
      //                       as ambiguous + show log for debugging.
      if (opened && opened.result.kind !== 'ok') {
        // Dump the byte-level mismatch to the output channel regardless of
        // outcome — useful even for already-applied (lets the user confirm
        // the fix really is the same code that's on disk).
        logFixMismatch(rt, finding, opened.result);
        if (opened.result.kind === 'already-applied') {
          await handleAlreadyAppliedFix(rt, finding, root);
        } else {
          const message =
            opened.result.kind === 'ambiguous'
              ? rt.tr('notif.fixAmbiguous', { count: opened.result.matchCount })
              : rt.tr('notif.fixNoMatch');
          const openLabel = rt.tr('notif.fixOpenFileAction');
          const showLogLabel = rt.tr('notif.fixShowLogAction');
          const choice = await vscode.window.showWarningMessage(message, openLabel, showLogLabel);
          if (choice === openLabel) {
            await vscode.commands.executeCommand('claudeReviewer.openFinding', finding.id);
          } else if (choice === showLogLabel) {
            rt.output.show(true);
          }
        }
      }
    }),
    vscode.commands.registerCommand('claudeReviewer.applyFixConfirm', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri || targetUri.scheme !== FixPreviewProvider.scheme) return;
      const findingId = FixPreviewProvider.findingIdFrom(targetUri);
      const finding = findingId ? rt.state.lastResult?.findings.find((f) => f.id === findingId) : undefined;
      if (!finding) {
        vscode.window.showWarningMessage(rt.tr('notif.couldNotApplyFix'));
        return;
      }
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      const previewDoc = await vscode.workspace.openTextDocument(targetUri);
      const fileUri = vscode.Uri.file(path.join(root, finding.file));
      const fileDoc = await vscode.workspace.openTextDocument(fileUri);
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        fileDoc.lineAt(fileDoc.lineCount - 1).range.end,
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(fileUri, fullRange, previewDoc.getText());
      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        await fileDoc.save();
        vscode.window.showInformationMessage(rt.tr('notif.fixApplied'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        rt.fixPreview.clear(targetUri);
      } else {
        vscode.window.showErrorMessage(rt.tr('notif.couldNotApplyFix'));
      }
    }),
    vscode.commands.registerCommand('claudeReviewer.applyFixCancel', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri || targetUri.scheme !== FixPreviewProvider.scheme) return;
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      rt.fixPreview.clear(targetUri);
    }),
    vscode.commands.registerCommand('claudeReviewer.dismissFinding', async (idOrFinding: string | Finding) => {
      if (!rt.state.lastResult) return;
      const id = typeof idOrFinding === 'string' ? idOrFinding : idOrFinding.id;
      const target = rt.state.lastResult.findings.find((f) => f.id === id);
      if (!target) return;
      const thisLabel = rt.tr('notif.dismissThis');
      const patternLabel = rt.tr('notif.dismissPattern');
      const pick = await vscode.window.showQuickPick(
        [
          { label: thisLabel, detail: rt.tr('notif.dismissThisDetail', { file: target.file, start: target.range.startLine, end: target.range.endLine }), value: 'this' as const },
          { label: patternLabel, detail: rt.tr('notif.dismissPatternDetail', { title: target.title }), value: 'pattern' as const },
        ],
        { placeHolder: rt.tr('notif.dismissPrompt'), ignoreFocusOut: false },
      );
      if (!pick) return;
      const record = pick.value === 'this'
        ? SilenceStore.thisRecord(target)
        : SilenceStore.patternRecord(target);
      await rt.silenceStore.add(record);
      await rt.setResult(rt.state.lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.restoreFinding', async (idOrFinding: string | Finding) => {
      if (!rt.state.lastResult) return;
      const id = typeof idOrFinding === 'string' ? idOrFinding : idOrFinding.id;
      const target = rt.state.lastResult.findings.find((f) => f.id === id);
      if (!target) return;
      await rt.silenceStore.remove(target);
      if (target.severity === 'silenced' && target.silencedFrom) {
        target.severity = target.silencedFrom;
        delete target.silencedFrom;
        delete target.silencedMode;
        delete target.silencedAt;
      }
      await rt.setResult(rt.state.lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.unsilence', async () => {
      const rules = rt.silenceStore.list();
      if (rules.length === 0) {
        vscode.window.showInformationMessage(rt.tr('notif.unsilenceEmpty'));
        return;
      }
      const picks = rules.map((r) => ({
        label: r.titleDisplay,
        description: r.mode === 'pattern'
          ? `[${r.category}] · pattern`
          : `[${r.category}] · ${r.file}:${r.startLine}-${r.endLine}`,
        record: r,
      }));
      const pick = await vscode.window.showQuickPick(picks, { placeHolder: rt.tr('notif.unsilencePrompt') });
      if (!pick) return;
      await rt.silenceStore.remove({
        id: '',
        file: pick.record.file ?? '',
        range: { startLine: pick.record.startLine ?? 1, endLine: pick.record.endLine ?? 1 },
        severity: 'silenced',
        category: pick.record.category,
        title: pick.record.titleDisplay,
        description: '',
        reasoning: '',
        questionsRaised: [],
        alternativesConsidered: [],
        evidence: [],
        relatedFiles: [],
        confidence: 'medium',
        pass: 'critique',
      });
      if (rt.state.lastResult) await rt.setResult(rt.state.lastResult);
    }),
    vscode.commands.registerCommand('claudeReviewer.clearSilenced', async () => {
      const rules = rt.silenceStore.list();
      if (rules.length === 0) {
        vscode.window.showInformationMessage(rt.tr('notif.unsilenceEmpty'));
        return;
      }
      const clearLabel = rt.tr('notif.clearSilencedButton');
      const ok = await vscode.window.showWarningMessage(
        rt.tr('notif.clearSilencedConfirm', { count: rules.length }),
        { modal: true },
        clearLabel,
      );
      if (ok !== clearLabel) return;
      await rt.silenceStore.clearAll();
      if (rt.state.lastResult) await rt.setResult(rt.state.lastResult);
      vscode.window.showInformationMessage(rt.tr('notif.silencedCleared'));
    }),
    vscode.commands.registerCommand('claudeReviewer.askFollowUp', async (idOrFinding: string | Finding) => {
      const finding =
        typeof idOrFinding === 'string'
          ? rt.state.lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding) return;
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      const cfg = vscode.workspace.getConfiguration('claudeReviewer');
      const cliPath = cfg.get<string>('claudeCliPath', 'claude') || 'claude';
      const model = cfg.get<string>('model', '');
      const lang = getLang(rt.ctx);
      const langInstruction = lang === 'es'
        ? 'Respond in neutral Latin American Spanish.'
        : 'Respond in English.';
      const initialPrompt = [
        'I am following up on a code-review finding raised by an earlier multi-pass review.',
        'Context (do not re-review the whole branch — just discuss THIS finding):',
        JSON.stringify(stripFinding(finding), null, 2),
        '',
        `${langInstruction} Acknowledge briefly, then wait for my question.`,
      ].join('\n');
      const sessionName = `Finding ${path.basename(finding.file)}:${finding.range.startLine} · ${finding.title.slice(0, 40)}`;
      const args = [cliPath];
      if (model) args.push('--model', model);
      args.push('--name', sessionName);
      args.push(initialPrompt);
      const term = vscode.window.createTerminal({
        name: `Claude · ${path.basename(finding.file)}:${finding.range.startLine}`,
        cwd: root,
        shellPath: args[0],
        shellArgs: args.slice(1),
      });
      term.show(true);
    }),
  ];
}

/**
 * Dump a detailed apply-fix mismatch report to the output channel. Goal: when
 * the user gets "fix doesn't match the current file" but the file hasn't
 * changed, the log makes the actual byte-level cause visible (CRLF, trailing
 * whitespace, smart quotes, indent style, the model citing slightly-different
 * code than what's on disk). Without this they have to guess.
 *
 * We print:
 *   - finding location and apply outcome
 *   - oldString verbatim with length + a hash-style "shape" line so invisible
 *     whitespace becomes visible
 *   - newString verbatim
 *   - the file slice at the cited range so the user can eyeball the diff
 *
 * Strings are size-capped (4 KB each) — fixes can be large and we don't want
 * to wedge the output channel for a multi-KB JSON blob.
 */
function logFixMismatch(
  rt: import('../core/events/extensionContext').ExtensionRuntime,
  finding: Finding,
  result: import('../ui/fixPreview').ApplyFixResult,
): void {
  const fix = finding.suggestedFix;
  if (!fix) return;
  const cap = (s: string | undefined, n = 4000): string => {
    if (!s) return '(empty)';
    if (s.length <= n) return s;
    return s.slice(0, n) + `\n…(truncated, total ${s.length} chars)`;
  };
  const reason = result.kind === 'ambiguous'
    ? `ambiguous (${result.matchCount} matches)`
    : result.kind === 'no-match'
      ? `no-match (${result.reason})`
      : 'unexpected ' + result.kind;
  rt.log('[applyFix] mismatch on ' + finding.file + ':' + finding.range.startLine + '-' + finding.range.endLine);
  rt.log('  outcome: ' + reason);
  rt.log('  oldString length: ' + (fix.oldString?.length ?? 0));
  rt.log('  oldString:\n' + cap(fix.oldString));
  rt.log('  newString length: ' + (fix.newString?.length ?? 0));
  rt.log('  newString:\n' + cap(fix.newString));
  if (fix.contextBefore) rt.log('  contextBefore:\n' + cap(fix.contextBefore, 500));
  if (fix.contextAfter) rt.log('  contextAfter:\n' + cap(fix.contextAfter, 500));
  // Also dump the actual file slice at the cited range so the user (and we)
  // can compare line-by-line. The model often cites code that LOOKS right
  // but differs in indent or quote style from what's really on disk.
  try {
    const root = rt.getWorkspaceRoot();
    if (!root) return;
    const fsPath = require('path').join(root, finding.file);
    const fileText = require('fs').readFileSync(fsPath, 'utf8') as string;
    const lines = fileText.split(/\r?\n/);
    const ctx = 1;
    const start = Math.max(0, finding.range.startLine - 1 - ctx);
    const end = Math.min(lines.length, finding.range.endLine + ctx);
    const slice = lines.slice(start, end)
      .map((l, i) => String(start + i + 1).padStart(4, ' ') + ' | ' + l)
      .join('\n');
    rt.log('  file slice [' + (start + 1) + '..' + end + ']:\n' + slice);
  } catch (e: any) {
    rt.log('  (could not read file slice: ' + (e?.message ?? String(e)) + ')');
  }
}

/**
 * Handle the already-applied outcome: the fix's newString is already in the
 * file. Most common cause is the user being on a different branch than the
 * one the review was run against (e.g. ran review on a feature branch, then
 * checked out main where the change was already merged). We compare the
 * current branch against the reviewed branch and offer a one-click switch
 * when they differ; otherwise we just confirm the fix is already in place.
 */
async function handleAlreadyAppliedFix(
  rt: import('../core/events/extensionContext').ExtensionRuntime,
  finding: Finding,
  root: string,
): Promise<void> {
  const reviewBranch = rt.state.lastResult?.summary.branch;
  let currentBranch: string | null = null;
  try {
    currentBranch = await new GitService(root).currentBranch();
  } catch {
    // Not a git repo or git not available — fall through to the "already
    // applied" message without the branch-switch affordance.
  }
  // Wrong-branch path: surface the mismatch and offer to switch.
  if (reviewBranch && currentBranch && currentBranch !== reviewBranch) {
    const message = rt.tr('notif.fixWrongBranch', {
      reviewBranch,
      currentBranch,
    });
    const switchLabel = rt.tr('notif.fixSwitchBranchAction', { branch: reviewBranch });
    const choice = await vscode.window.showWarningMessage(message, switchLabel);
    if (choice === switchLabel) {
      try {
        await new GitService(root).checkout(reviewBranch);
        vscode.window.showInformationMessage(rt.tr('notif.fixSwitchedBranch', { branch: reviewBranch }));
        // Re-trigger the apply — the file on the review branch should match
        // the fix's oldString, so the second attempt usually succeeds.
        await vscode.commands.executeCommand('claudeReviewer.applyFix', finding);
      } catch (e: any) {
        vscode.window.showErrorMessage(rt.tr('notif.fixSwitchBranchFailed', { error: e?.message ?? String(e) }));
      }
    }
    return;
  }
  // Same branch (or no branch info): the fix really is already applied.
  vscode.window.showInformationMessage(rt.tr('notif.fixAlreadyApplied'));
}
