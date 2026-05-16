import * as vscode from 'vscode';
import * as path from 'path';
import { Finding, ReviewResult, Severity } from '../types';

type Node = GroupNode | FindingNode;

export type GroupMode = 'severity' | 'file' | 'category';

class GroupNode {
  readonly kind = 'group' as const;
  constructor(public label: string, public children: Finding[], public collapsibleState: vscode.TreeItemCollapsibleState) {}
}

class FindingNode {
  readonly kind = 'finding' as const;
  constructor(public finding: Finding) {}
}

const SEVERITY_ORDER: Severity[] = ['critical', 'major', 'minor', 'nit', 'praise'];

export class FindingsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private result: ReviewResult | null = null;
  private groupBy: GroupMode = 'severity';
  private _onDidChangeGroupBy = new vscode.EventEmitter<GroupMode>();
  readonly onDidChangeGroupBy = this._onDidChangeGroupBy.event;

  setResult(result: ReviewResult | null) {
    this.result = result;
    this._onDidChange.fire(undefined);
  }

  setGroupBy(mode: GroupMode) {
    if (mode === this.groupBy) return;
    this.groupBy = mode;
    this._onDidChangeGroupBy.fire(mode);
    this._onDidChange.fire(undefined);
  }

  getGroupBy(): GroupMode {
    return this.groupBy;
  }

  /**
   * Count for the view badge: critical + major findings (the ones that should
   * draw the user's attention). 0 means the view collapses its badge.
   */
  attentionCount(): number {
    if (!this.result) return 0;
    return this.result.findings.filter(
      (f) => !f.dismissed && (f.severity === 'critical' || f.severity === 'major'),
    ).length;
  }

  refresh() {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.kind === 'group') {
      const item = new vscode.TreeItem(element.label, element.collapsibleState);
      item.description = `${element.children.length}`;
      item.iconPath = new vscode.ThemeIcon('folder');
      return item;
    }
    const f = element.finding;
    const item = new vscode.TreeItem(f.title, vscode.TreeItemCollapsibleState.None);
    item.description = `${path.basename(f.file)}:${f.range.startLine}`;
    item.tooltip = `${f.file}:${f.range.startLine}-${f.range.endLine}\n\n${f.description}`;
    item.contextValue = f.suggestedFix ? 'finding-with-fix' : 'finding';
    item.iconPath = severityIcon(f.severity);
    item.command = {
      command: 'claudeReviewer.openFinding',
      title: 'Open',
      arguments: [f.id],
    };
    if (f.dismissed) {
      item.label = { label: f.title, highlights: [] };
      item.description = `dismissed · ${path.basename(f.file)}:${f.range.startLine}`;
    }
    return item;
  }

  getChildren(element?: Node): Node[] {
    if (!this.result) return [];
    if (!element) {
      const findings = this.result.findings.filter((f) => !f.dismissed);
      if (this.groupBy === 'severity') {
        const groups: Node[] = [];
        for (const sev of SEVERITY_ORDER) {
          const arr = findings.filter((f) => f.severity === sev);
          if (arr.length === 0) continue;
          groups.push(
            new GroupNode(sev.toUpperCase(), arr, sev === 'critical' || sev === 'major'
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.Collapsed),
          );
        }
        return groups;
      }
      if (this.groupBy === 'file') {
        const byFile = new Map<string, Finding[]>();
        for (const f of findings) {
          const list = byFile.get(f.file) ?? [];
          list.push(f);
          byFile.set(f.file, list);
        }
        return [...byFile.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([file, list]) => new GroupNode(file, list, vscode.TreeItemCollapsibleState.Collapsed));
      }
      const byCat = new Map<string, Finding[]>();
      for (const f of findings) {
        const list = byCat.get(f.category) ?? [];
        list.push(f);
        byCat.set(f.category, list);
      }
      return [...byCat.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, list]) => new GroupNode(cat, list, vscode.TreeItemCollapsibleState.Collapsed));
    }
    if (element.kind === 'group') {
      return element.children.map((f) => new FindingNode(f));
    }
    return [];
  }
}

function severityIcon(sev: Severity): vscode.ThemeIcon {
  switch (sev) {
    case 'critical':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('claudeReviewer.critical'));
    case 'major':
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('claudeReviewer.major'));
    case 'minor':
      return new vscode.ThemeIcon('info', new vscode.ThemeColor('claudeReviewer.minor'));
    case 'nit':
      return new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('claudeReviewer.nit'));
    case 'praise':
      return new vscode.ThemeIcon('star-full', new vscode.ThemeColor('claudeReviewer.nit'));
  }
}
