import * as vscode from 'vscode';
import { ReviewResult } from '../../types';
import { PartialReviewSummary } from '../reviewPanel';
import { ReviewEvent, ReviewEventBus } from '../../core/events';
import { SummaryDeps, RunState } from './types';
import { reduceEvent } from './eventReducer';
import { routeMessage } from './messageRouter';
import { renderHtml } from './render';

export type { SummaryDeps, HistoryEntry, RunState } from './types';

/**
 * Sidebar dashboard. Responsibilities:
 *   1. Show an at-a-glance status of the workspace (current branch, base,
 *      whether a review is running, paused, or finished).
 *   2. Provide the fastest path to a review: a single ▶ button that runs
 *      against the detected base/head — no need to open the big panel.
 *   3. Surface paused-review state and history (last 3 reviews per branch).
 */
export class SummaryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeReviewer.summary';
  private view?: vscode.WebviewView;
  private result: ReviewResult | null = null;
  private partial: PartialReviewSummary | null = null;
  private branchInfo: { current: string | null; defaultBase: string | null } = {
    current: null,
    defaultBase: null,
  };
  private runState: RunState = { kind: 'idle' };
  private tickTimer?: NodeJS.Timeout;
  private busSub: vscode.Disposable;

  constructor(
    private readonly deps: SummaryDeps,
    bus: ReviewEventBus,
  ) {
    this.busSub = bus.onEvent((e) => this.handleEvent(e));
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.render();
    webviewView.webview.onDidReceiveMessage((msg) =>
      routeMessage(this.deps, { refreshBranchInfo: () => void this.refreshBranchInfo() }, msg),
    );
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) void this.refreshBranchInfo();
    });
    void this.refreshBranchInfo();
  }

  dispose() {
    this.stopTick();
    this.busSub.dispose();
  }

  setResult(result: ReviewResult | null) {
    this.result = result;
    if (result && this.runState.kind === 'running') {
      // A fresh result implicitly clears the transient run state.
      this.runState = { kind: 'done', verdict: result.summary.overallVerdict, findingCount: result.findings.length };
      this.stopTick();
    }
    this.rerender();
  }

  setPartialSummary(summary: PartialReviewSummary | null) {
    this.partial = summary;
    this.rerender();
  }

  onLanguageChanged() {
    this.rerender();
  }

  async refreshBranchInfo() {
    try {
      const [current, defaultBase] = await Promise.all([
        this.deps.getCurrentBranch(),
        this.deps.getDefaultBaseBranch(),
      ]);
      this.branchInfo = { current, defaultBase };
    } catch {
      this.branchInfo = { current: null, defaultBase: null };
    }
    this.rerender();
  }

  private handleEvent(e: ReviewEvent) {
    const { state, shouldTick } = reduceEvent(this.runState, e);
    this.runState = state;
    if (shouldTick) this.startTick();
    else this.stopTick();
    this.rerender();
  }

  private startTick() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.rerender(), 1000);
  }

  private stopTick() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  private rerender() {
    if (this.view) this.view.webview.html = this.render();
  }

  private render(): string {
    return renderHtml({
      lang: this.deps.getLang(),
      result: this.result,
      partial: this.partial,
      runState: this.runState,
      branchInfo: this.branchInfo,
      history: this.deps.getHistory(),
    });
  }
}
