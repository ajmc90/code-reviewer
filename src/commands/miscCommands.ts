import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getLang, setLang, t } from '../i18n';
import { ExtensionRuntime } from '../core/extensionContext';
import { renderReportMarkdown } from '../core/reportMarkdown';

export function registerMiscCommands(rt: ExtensionRuntime): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeReviewer.exportReport', async () => {
      if (!rt.state.lastResult) {
        vscode.window.showInformationMessage(rt.tr('notif.noReviewToExport'));
        return;
      }
      const root = rt.getWorkspaceRoot();
      if (!root) return;
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(root, `claude-review-${Date.now()}.md`)),
        filters: { Markdown: ['md'] },
      });
      if (!target) return;
      const md = renderReportMarkdown(rt.state.lastResult, getLang(rt.ctx));
      fs.writeFileSync(target.fsPath, md, 'utf8');
      vscode.window.showInformationMessage(rt.tr('notif.reportSaved', { path: target.fsPath }));
    }),
    vscode.commands.registerCommand('claudeReviewer.setLanguageEn', async () => {
      await setLang(rt.ctx, 'en');
      vscode.window.showInformationMessage(t('notif.languageSwitched', 'en', { lang: t('lang.englishLong', 'en') }));
    }),
    vscode.commands.registerCommand('claudeReviewer.setLanguageEs', async () => {
      await setLang(rt.ctx, 'es');
      vscode.window.showInformationMessage(t('notif.languageSwitched', 'es', { lang: t('lang.spanishLong', 'es') }));
    }),
    vscode.commands.registerCommand('claudeReviewer.findings.groupBySeverity', () =>
      rt.findingsTree.setGroupBy('severity'),
    ),
    vscode.commands.registerCommand('claudeReviewer.findings.groupByFile', () =>
      rt.findingsTree.setGroupBy('file'),
    ),
    vscode.commands.registerCommand('claudeReviewer.findings.groupByCategory', () =>
      rt.findingsTree.setGroupBy('category'),
    ),
    vscode.commands.registerCommand('claudeReviewer.findings.refresh', () => {
      rt.findingsTree.refresh();
      void rt.summaryView.refreshBranchInfo();
    }),
  ];
}
