import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getLang, setLang, t } from '../i18n';
import { ExtensionRuntime } from '../core/extensionContext';
import { renderReportMarkdown } from '../core/reportMarkdown';
import { GitService } from '../git/gitService';
import { estimateReviewCost, buildEstimatorInput } from '../core/estimator';
import { SampleStore } from '../core/estimator/sampleStore';
import { PassName } from '../core/events/events';

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
    // Debug command: estimate the cost of reviewing current branch vs default
    // base WITHOUT actually running the review. Used to validate the
    // estimator's predictions against later real-run telemetry.
    vscode.commands.registerCommand('claudeReviewer.estimateReview', async () => {
      const root = rt.getWorkspaceRoot();
      if (!root) {
        vscode.window.showErrorMessage(rt.tr('notif.notGitRepo'));
        return;
      }
      const git = new GitService(root);
      if (!(await git.isRepo())) {
        vscode.window.showErrorMessage(rt.tr('notif.notGitRepo'));
        return;
      }
      const cfg = vscode.workspace.getConfiguration('claudeReviewer');
      const configuredBase = cfg.get<string>('baseBranch', '');
      const base = configuredBase || (await git.detectDefaultBaseBranch());
      const head = await git.currentBranch();
      let stat;
      let rawDiffBytes = 0;
      try {
        stat = await git.diffStat(base, head);
        const rawDiff = await git.rawDiff(base, head);
        rawDiffBytes = Buffer.byteLength(rawDiff, 'utf8');
      } catch (e: any) {
        vscode.window.showErrorMessage(`Could not diff ${base}...${head}: ${e.message}`);
        return;
      }
      if (stat.filesChanged === 0) {
        vscode.window.showInformationMessage(`No changes between ${base} and ${head}.`);
        return;
      }
      const depth = cfg.get<'fast' | 'balanced' | 'deep' | 'obsessive'>('reasoningDepth', 'deep');
      const useSessionReuse = cfg.get<boolean>('useSessionReuse', true);
      const passesCfg = cfg.get<Record<string, boolean>>('passes', {});
      const passes: PassName[] = [];
      if (passesCfg.structural !== false) passes.push('structural');
      if (passesCfg.explore !== false) passes.push('explore');
      if (passesCfg.security !== false) passes.push('security');
      if (passesCfg.performance !== false) passes.push('performance');
      // accessibility skipped — we can't tell without scanning the diff for UI files
      if (passesCfg.tests !== false) passes.push('tests');
      if (passesCfg.gaps !== false) passes.push('gaps');
      if (passesCfg.permute !== false && (depth === 'deep' || depth === 'obsessive')) passes.push('permute');
      if (passesCfg.critique !== false) passes.push('critique');
      passes.push('summary');

      const input = buildEstimatorInput({
        rawDiffBytes,
        linesAdded: stat.insertions,
        linesRemoved: stat.deletions,
        filesChanged: stat.filesChanged,
        passes,
        depth,
        useSessionReuse,
      });
      const est = estimateReviewCost(input);

      const sampleStore = new SampleStore(rt.ctx);
      const counts = sampleStore.getSampleCounts();

      rt.log(`[estimate] base=${base} head=${head} files=${stat.filesChanged} +${stat.insertions}/-${stat.deletions}`);
      rt.log(`[estimate] depth=${depth} sessionReuse=${useSessionReuse} passes=${passes.length}`);
      rt.log(`[estimate] central=${est.centralTokens.toLocaleString()} tokens  (range ${est.lowTokens.toLocaleString()}–${est.highTokens.toLocaleString()})`);
      rt.log(`[estimate] USD reference: $${est.centralUsd.toFixed(4)} (low $${est.lowUsd.toFixed(4)}, high $${est.highUsd.toFixed(4)}, worst $${est.worstCaseUsd.toFixed(4)})`);
      rt.log(`[estimate] duration: ~${est.estimatedDurationSec}s`);
      rt.log(`[estimate] confidence: ${est.confidence}  samples: workspace=${counts.workspace} global=${counts.global}`);
      for (const f of est.factors) rt.log(`[estimate]   factor: ${f}`);
      for (const p of est.byPass) {
        rt.log(`[estimate]   ${p.pass.padEnd(12)} ~${p.tokens.toLocaleString().padStart(7)} tok  $${p.usdReference.toFixed(4)}`);
      }

      const summary = `~${(est.centralTokens / 1000).toFixed(0)}K tokens  •  ~${Math.round(est.estimatedDurationSec / 60)} min  •  $${est.centralUsd.toFixed(2)} ref`;
      vscode.window.showInformationMessage(`Estimate: ${summary}  (see Output channel for breakdown)`);
    }),
    // Debug command: dump the current sample store contents to the output
    // channel so users can verify what the estimator is calibrating on.
    vscode.commands.registerCommand('claudeReviewer.dumpSamples', async () => {
      const sampleStore = new SampleStore(rt.ctx);
      const counts = sampleStore.getSampleCounts();
      const { samples, scope } = sampleStore.getCalibratedSamples(1);
      rt.log(`[samples] counts: workspace=${counts.workspace} global=${counts.global} usingScope=${scope}`);
      for (const s of samples) {
        const dur = s.totalDurationMs ? `${Math.round(s.totalDurationMs / 1000)}s` : '?';
        rt.log(`[samples] ${new Date(s.at).toISOString()}  $${s.totalUsd.toFixed(4)}  ${s.totalTokens.toLocaleString()} tok  ${dur}  ${s.actualFindingsCount} findings  depth=${s.depth}  sessions=${s.useSessionReuse}`);
      }
      vscode.window.showInformationMessage(`Samples: workspace=${counts.workspace} global=${counts.global} (see Output channel)`);
    }),
  ];
}
