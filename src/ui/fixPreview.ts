import * as vscode from 'vscode';
import * as path from 'path';
import { Finding } from '../types';

/**
 * In-memory provider for the "claude-fix:" URI scheme. We use a virtual
 * document as the RIGHT side of a diff editor so the user can review the
 * suggested fix exactly as VS Code shows any other diff, then either accept
 * (which writes the right side into the real file) or close.
 *
 * URI shape: claude-fix:/relative/path.ts?findingId=abc-123
 * The path is preserved verbatim so VS Code picks the right language for
 * syntax highlighting from the file extension.
 */
export class FixPreviewProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'claude-fix';

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  /** key: uri.toString() → preview content (with the fix applied). */
  private contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  /** Register content for a virtual URI. Returns the URI for opening. */
  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  /** Free memory once the preview is closed/accepted. */
  clear(uri: vscode.Uri): void {
    this.contents.delete(uri.toString());
  }

  /**
   * Build the virtual URI a finding's fix preview lives under. Includes the
   * finding id as a query param so command handlers can recover the finding
   * later (the diff editor only knows the URI).
   */
  static uriFor(finding: Finding): vscode.Uri {
    return vscode.Uri.from({
      scheme: FixPreviewProvider.scheme,
      path: '/' + finding.file,
      query: `findingId=${encodeURIComponent(finding.id)}`,
    });
  }

  /** Extract the finding id from a claude-fix URI, if it has one. */
  static findingIdFrom(uri: vscode.Uri): string | null {
    if (uri.scheme !== FixPreviewProvider.scheme) return null;
    const match = /findingId=([^&]+)/.exec(uri.query);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * Build the would-be content of the target file with the fix applied. We
 * replace lines [startLine, endLine] (1-indexed inclusive) with the
 * suggestedFix.replacement. We DON'T trim or reformat — what the user sees in
 * the diff right side is exactly what gets written.
 */
export function applyFixToBuffer(originalText: string, finding: Finding): string {
  if (!finding.suggestedFix) return originalText;
  const lines = originalText.split('\n');
  const start = Math.max(0, finding.range.startLine - 1);
  const end = Math.max(start, finding.range.endLine - 1);
  const before = lines.slice(0, start);
  const after = lines.slice(end + 1);
  // Preserve trailing-newline shape: split inserts a trailing '' if the file
  // ended with \n. We hand back the joined array verbatim.
  const replacement = finding.suggestedFix.replacement.split('\n');
  return [...before, ...replacement, ...after].join('\n');
}

/**
 * Open a side-by-side diff editor that compares the file on disk to its
 * fix-applied counterpart. Returns the URIs so callers can dispose later.
 */
export async function openFixDiff(
  finding: Finding,
  workspaceRoot: string,
  provider: FixPreviewProvider,
): Promise<{ leftUri: vscode.Uri; rightUri: vscode.Uri }> {
  const leftUri = vscode.Uri.file(path.join(workspaceRoot, finding.file));
  const doc = await vscode.workspace.openTextDocument(leftUri);
  const previewContent = applyFixToBuffer(doc.getText(), finding);

  const rightUri = FixPreviewProvider.uriFor(finding);
  provider.set(rightUri, previewContent);

  const title = `${path.basename(finding.file)}: ${finding.title.slice(0, 60)}${finding.title.length > 60 ? '…' : ''}`;
  await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
    preview: true,
    preserveFocus: false,
  });

  return { leftUri, rightUri };
}
