import * as vscode from 'vscode';
import { Finding, Severity } from '../types';

/**
 * Paints findings directly onto the editor: a colored gutter marker,
 * an inline tag at end of line, and a hover with the full reasoning.
 */
export class FindingsDecorator implements vscode.Disposable {
  private decorationByLevel: Record<Severity, vscode.TextEditorDecorationType>;
  private active: Finding[] = [];
  private listener: vscode.Disposable;

  constructor() {
    this.decorationByLevel = {
      critical: this.makeType('claudeReviewer.critical', '🛑'),
      major: this.makeType('claudeReviewer.major', '⚠'),
      minor: this.makeType('claudeReviewer.minor', 'ⓘ'),
      nit: this.makeType('claudeReviewer.nit', '·'),
      praise: this.makeType('claudeReviewer.nit', '✨'),
    };

    this.listener = vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
  }

  private makeType(colorId: string, badge: string): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      overviewRulerColor: new vscode.ThemeColor(colorId),
      isWholeLine: true,
      after: {
        margin: '0 0 0 2em',
        color: new vscode.ThemeColor(colorId),
        contentText: ` ${badge} Claude`,
      },
      gutterIconSize: 'contain',
    });
  }

  setFindings(findings: Finding[]) {
    this.active = findings.filter((f) => !f.dismissed);
    this.refresh();
  }

  refresh() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    const buckets: Record<Severity, vscode.DecorationOptions[]> = {
      critical: [],
      major: [],
      minor: [],
      nit: [],
      praise: [],
    };

    for (const f of this.active) {
      const absolute = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), f.file).fsPath;
      if (editor.document.uri.fsPath !== absolute) continue;

      const startLine = Math.max(0, f.range.startLine - 1);
      const endLine = Math.max(startLine, f.range.endLine - 1);
      const endChar = Math.max(0, editor.document.lineAt(Math.min(endLine, editor.document.lineCount - 1)).text.length);
      const range = new vscode.Range(startLine, 0, endLine, endChar);

      const hover = renderHover(f);
      buckets[f.severity].push({ range, hoverMessage: hover });
    }

    for (const sev of Object.keys(buckets) as Severity[]) {
      editor.setDecorations(this.decorationByLevel[sev], buckets[sev]);
    }
  }

  dispose() {
    for (const d of Object.values(this.decorationByLevel)) d.dispose();
    this.listener.dispose();
  }
}

function renderHover(f: Finding): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.appendMarkdown(`### ${severityEmoji(f.severity)} ${escapeMd(f.title)}\n\n`);
  md.appendMarkdown(`**Category:** \`${f.category}\` · **Confidence:** \`${f.confidence}\` · **Pass:** \`${f.pass}\`\n\n`);
  md.appendMarkdown(`${f.description}\n\n`);
  if (f.reasoning) {
    md.appendMarkdown(`**Reasoning**\n\n${f.reasoning}\n\n`);
  }
  if (f.questionsRaised.length) {
    md.appendMarkdown('**Questions Claude asked itself**\n\n');
    for (const q of f.questionsRaised) md.appendMarkdown(`- ${q}\n`);
    md.appendMarkdown('\n');
  }
  if (f.alternativesConsidered.length) {
    md.appendMarkdown('**Alternatives considered**\n\n');
    for (const a of f.alternativesConsidered) md.appendMarkdown(`- ${a}\n`);
    md.appendMarkdown('\n');
  }
  if (f.evidence.length) {
    md.appendMarkdown('**Evidence**\n\n');
    for (const e of f.evidence) md.appendMarkdown(`> ${e.replace(/\n/g, '\n> ')}\n\n`);
  }
  if (f.suggestedFix) {
    md.appendMarkdown(`**Suggested fix** (confidence: \`${f.suggestedFix.confidence}\`)\n\n${f.suggestedFix.description}\n\n`);
    md.appendCodeblock(f.suggestedFix.replacement, guessLang(f.file));
    const applyCmd = vscode.Uri.parse(
      `command:claudeReviewer.applyFix?${encodeURIComponent(JSON.stringify([f.id]))}`,
    );
    md.appendMarkdown(`\n[Apply fix](${applyCmd}) · `);
  }
  const dismissCmd = vscode.Uri.parse(
    `command:claudeReviewer.dismissFinding?${encodeURIComponent(JSON.stringify([f.id]))}`,
  );
  const askCmd = vscode.Uri.parse(
    `command:claudeReviewer.askFollowUp?${encodeURIComponent(JSON.stringify([f.id]))}`,
  );
  md.appendMarkdown(`[Ask follow-up](${askCmd}) · [Dismiss](${dismissCmd})`);
  return md;
}

function severityEmoji(s: Severity): string {
  return { critical: '🛑', major: '⚠️', minor: 'ℹ️', nit: '·', praise: '✨' }[s];
}

function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1');
}

function guessLang(file: string): string {
  const ext = file.split('.').pop() ?? '';
  return {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    dart: 'dart',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    sh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    md: 'markdown',
  }[ext] || '';
}
