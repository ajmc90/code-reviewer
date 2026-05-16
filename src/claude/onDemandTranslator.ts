import * as vscode from 'vscode';
import { Finding } from '../types';
import { Lang } from '../i18n';
import { ReviewPanel } from '../ui/reviewPanel';
import { ExtensionRuntime } from '../core/extensionContext';

export function extractTranslatedFields(f: Finding): any {
  return {
    title: f.title,
    description: f.description,
    reasoning: f.reasoning,
    questionsRaised: f.questionsRaised,
    alternativesConsidered: f.alternativesConsidered,
    evidence: f.evidence,
    suggestedFix: f.suggestedFix
      ? { description: f.suggestedFix.description, replacement: f.suggestedFix.replacement }
      : undefined,
  };
}

/**
 * Per-finding on-demand translator. Looks up the finding by id, asks Claude to
 * translate its user-visible fields, caches the result on the finding (so
 * subsequent toggles are instant), and notifies the panel webview.
 */
export async function translateFindingOnDemand(
  rt: ExtensionRuntime,
  id: string,
  targetLang: Lang,
): Promise<void> {
  const finding = rt.state.lastResult?.findings.find((f) => f.id === id);
  if (!finding || !rt.state.lastResult) return;

  // Already cached → just inform the webview so it can flip the row.
  if (finding.translations?.[targetLang]) {
    ReviewPanel.currentInstance()?.postFindingTranslation({
      id,
      lang: targetLang,
      fields: finding.translations[targetLang],
    });
    return;
  }
  // If the user asked for the original language, nothing to do server-side.
  if ((finding.originalLang ?? 'en') === targetLang) {
    ReviewPanel.currentInstance()?.postFindingTranslation({
      id,
      lang: targetLang,
      fields: extractTranslatedFields(finding),
    });
    return;
  }

  const root = rt.getWorkspaceRoot();
  if (!root) return;
  const cfg = vscode.workspace.getConfiguration('claudeReviewer');
  const model = cfg.get<string>('translationModel', '') || cfg.get<string>('model', '') || undefined;
  const cli = rt.buildCli();

  ReviewPanel.currentInstance()?.postFindingTranslationPending(id, targetLang);
  try {
    const { translateFinding } = await import('./translator');
    const translated = await translateFinding({
      cli,
      finding,
      targetLang,
      cwd: root,
      model,
      timeoutMs: cfg.get<number>('cliTimeoutMs', 600000),
    });
    finding.translations = { ...(finding.translations ?? {}), [targetLang]: translated };
    await rt.setResult(rt.state.lastResult);
    ReviewPanel.currentInstance()?.postFindingTranslation({
      id,
      lang: targetLang,
      fields: translated,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    rt.log(`Translation failed for finding ${id}: ${msg}`);
    ReviewPanel.currentInstance()?.postFindingTranslationError(id, targetLang, msg);
    vscode.window.showErrorMessage(rt.tr('notif.translationFailed', { error: msg }));
  }
}
