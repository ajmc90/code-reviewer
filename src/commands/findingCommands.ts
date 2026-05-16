import * as vscode from 'vscode';
import * as path from 'path';
import { Finding } from '../types';
import { FixPreviewProvider, openFixDiff } from '../ui/fixPreview';
import { SilenceStore } from '../core/silenceStore';
import { getLang } from '../i18n';
import { ExtensionRuntime } from '../core/extensionContext';

function stripFinding(f: Finding): any {
  const { id, dismissed, translations, displayLang, originalLang, ...rest } = f;
  return rest;
}

export function registerFindingCommands(rt: ExtensionRuntime): vscode.Disposable[] {
  return [
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
      const finding =
        typeof idOrFinding === 'string'
          ? rt.state.lastResult?.findings.find((f) => f.id === idOrFinding)
          : idOrFinding;
      if (!finding?.suggestedFix) {
        vscode.window.showWarningMessage(rt.tr('notif.noSuggestedFix'));
        return;
      }
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      await openFixDiff(finding, root, rt.fixPreview);
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
