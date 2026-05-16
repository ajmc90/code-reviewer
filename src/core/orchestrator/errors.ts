import { PartialReviewState } from '../../types';

/**
 * Thrown when the user picked "Stop" on a pass-failure prompt. Carries the
 * partial state so the extension can persist it and offer a Resume action.
 */
export class ReviewPausedError extends Error {
  constructor(public readonly state: PartialReviewState) {
    super('Review paused');
    this.name = 'ReviewPausedError';
  }
}
