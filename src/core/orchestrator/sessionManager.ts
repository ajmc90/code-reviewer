import { randomUUID } from 'crypto';

/**
 * Tracks lifecycle of a single Claude CLI session that is reused across
 * multiple pass invocations to share prompt-cache hits.
 *
 * One SessionState belongs to a group of passes that share the SAME tool
 * configuration — changing tools between calls invalidates most of the
 * cache, so the orchestrator segments sessions by tools. Today that means:
 *   - Session A: structural pass only (tools: Read, Grep, Glob)
 *   - Session B: explore + specialists + completeness + critique + summary
 *                (tools: none)
 *
 * `initialized` flips to true after the first successful CLI call so the
 * next call switches from --session-id to --resume. Failures leave it false
 * so the next attempt creates a fresh session (avoids stuck-with-corrupted-id
 * states).
 */
export interface SessionState {
  sessionId: string;
  initialized: boolean;
}

export function createSession(): SessionState {
  return { sessionId: randomUUID(), initialized: false };
}

/**
 * Bundle of sessions for one review. Mirrors the tool-group segmentation:
 * `withTools` holds the session for passes that use file-system tools,
 * `noTools` holds the session for prompt-only passes. Either may be unused
 * (e.g. if structural pass is disabled, withTools is created but never used,
 * which is harmless — the session is only spawned on first CLI call).
 */
export interface ReviewSessions {
  withTools: SessionState;
  noTools: SessionState;
}

export function createReviewSessions(): ReviewSessions {
  return {
    withTools: createSession(),
    noTools: createSession(),
  };
}

/**
 * Mark a session as initialized after a successful CLI call.
 */
export function markSessionInitialized(session: SessionState): void {
  session.initialized = true;
}

/**
 * Reset a session to uninitialized — call this when --resume fails (session
 * expired or corrupted). The next call will create a fresh session, losing
 * cache reuse for that one call but recovering the review.
 */
export function resetSession(session: SessionState): void {
  session.sessionId = randomUUID();
  session.initialized = false;
}
