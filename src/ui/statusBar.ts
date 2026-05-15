import * as vscode from 'vscode';
import { ReviewEventBus, PassName } from '../core/events';
import { Lang, t } from '../i18n';

const PASS_ORDER: PassName[] = ['context', 'diff', 'structural', 'explore', 'security', 'performance', 'accessibility', 'tests', 'gaps', 'permute', 'critique', 'summary'];
const PASS_SHORT: Record<PassName, string> = {
  context: 'ctx',
  diff: 'diff',
  structural: 'struct',
  explore: 'explore',
  security: 'sec',
  performance: 'perf',
  accessibility: 'a11y',
  tests: 'tests',
  gaps: 'gaps',
  permute: 'alts',
  critique: 'critique',
  summary: 'sum',
};

export class ReviewStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private sub: vscode.Disposable;
  private state: 'idle' | 'running' | 'done' | 'error' = 'idle';
  private completed = new Set<PassName>();
  private current: PassName | null = null;
  private findingCount = 0;
  private startedAt = 0;
  private timer?: NodeJS.Timeout;

  constructor(bus: ReviewEventBus, private readonly getLang: () => Lang) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'claudeReviewer.showPanel';
    this.render();
    this.item.show();
    this.sub = bus.onEvent((e) => {
      if (e.kind === 'start') {
        this.state = 'running';
        this.completed.clear();
        this.current = null;
        this.findingCount = 0;
        this.startedAt = e.at;
        this.startTimer();
      } else if (e.kind === 'context') {
        this.completed.add('context');
      } else if (e.kind === 'diff') {
        this.completed.add('diff');
      } else if (e.kind === 'passStart') {
        this.current = e.pass;
      } else if (e.kind === 'passDone') {
        this.completed.add(e.pass);
        if (this.current === e.pass) this.current = null;
      } else if (e.kind === 'passError') {
        this.state = 'error';
        this.stopTimer();
      } else if (e.kind === 'findingAdded') {
        this.findingCount++;
      } else if (e.kind === 'done') {
        this.state = 'done';
        this.stopTimer();
      } else if (e.kind === 'cancelled') {
        this.state = 'idle';
        this.stopTimer();
      }
      this.render();
    });
  }

  private startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => this.render(), 1000);
  }
  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  onLanguageChanged() {
    this.render();
  }

  private render() {
    const lang = this.getLang();
    let text: string;
    let bg: vscode.ThemeColor | undefined;
    if (this.state === 'idle') {
      text = `$(eye) ${t('status.idle', lang)}`;
    } else if (this.state === 'running') {
      const elapsed = Math.round((Date.now() - this.startedAt) / 1000);
      const order = PASS_ORDER.filter((p) => this.completed.has(p) || this.current === p);
      const last = this.current ?? order[order.length - 1] ?? 'context';
      const dots = PASS_ORDER.map((p) => (this.completed.has(p) ? '●' : this.current === p ? '◐' : '·')).join('');
      text = `$(sync~spin) ${t('status.reviewing', lang, { pass: PASS_SHORT[last], dots, count: this.findingCount, seconds: elapsed })}`;
      bg = new vscode.ThemeColor('statusBarItem.prominentBackground');
    } else if (this.state === 'done') {
      text = `$(check) ${t('status.done', lang, { count: this.findingCount })}`;
    } else {
      text = `$(error) ${t('status.failed', lang)}`;
      bg = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    this.item.text = text;
    this.item.backgroundColor = bg;
    this.item.tooltip = t('status.tooltip', lang);
  }

  dispose() {
    this.stopTimer();
    this.sub.dispose();
    this.item.dispose();
  }
}
