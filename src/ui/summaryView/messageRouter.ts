import { SummaryDeps } from './types';

export interface MessageContext {
  refreshBranchInfo: () => void;
}

/**
 * Dispatches a webview-originated message to the matching SummaryDeps callback.
 * `ctx.refreshBranchInfo` is the only handler that lives on the provider
 * itself (it touches view-private state).
 */
export function routeMessage(
  deps: SummaryDeps,
  ctx: MessageContext,
  msg: { type?: string; id?: string } | null,
): void {
  if (!msg?.type) return;
  switch (msg.type) {
    case 'openPanel':       deps.openPanel(); break;
    case 'reviewNow':       deps.startReviewCurrentBranch(); break;
    case 'configureReview': deps.startReviewInteractive(); break;
    case 'cancel':          deps.cancelReview(); break;
    case 'resume':          deps.resumeReview(); break;
    case 'discardPartial':  deps.discardPartial(); break;
    case 'export':          deps.exportReport(); break;
    case 'recall':          if (msg.id) deps.recallReview(msg.id); break;
    case 'refreshBranches': ctx.refreshBranchInfo(); break;
  }
}
