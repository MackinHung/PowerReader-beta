/**
 * PowerReader - Article Status State Machine
 *
 * Enforces valid state transitions for article lifecycle.
 * All functions are pure and immutable.
 *
 * State flow:
 * crawled -> filtered -> deduplicated -> analyzed -> validated -> published
 *                                            |
 *                                            +-> rejected
 *
 * Navigation:
 * - Upstream: shared/enums.js (ARTICLE_STATUS, ARTICLE_STATUS_TRANSITIONS)
 * - Downstream: T01 (API), T02 (crawler writes), T03 (analysis writes)
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 *
 * Change Log:
 * | Date       | Version | Changes                         | Reason              |
 * |------------|---------|--------------------------------|---------------------|
 * | 2026-03-07 | v1.0    | Initial state machine module   | Phase 2 shared libs |
 */

import {
  ARTICLE_STATUS,
  ARTICLE_STATUS_TRANSITIONS,
  canTransitionStatus
} from './enums.js';
import { nowISO } from './utils.js';

// Re-export for convenience (teams import from state-machine.js)
export { canTransitionStatus, ARTICLE_STATUS, ARTICLE_STATUS_TRANSITIONS };

/**
 * Attempt a status transition, returning a new article object (immutable).
 * Throws if the transition is not allowed.
 *
 * @param {object} article - Current article object (must have .status)
 * @param {string} targetStatus - Target ARTICLE_STATUS value
 * @returns {object} New article object with updated status + status_updated_at
 * @throws {Error} If transition is not allowed
 */
export function transitionStatus(article, targetStatus) {
  const currentStatus = article.status;

  if (!canTransitionStatus(currentStatus, targetStatus)) {
    throw new Error(
      `Invalid state transition: ${currentStatus} -> ${targetStatus}. ` +
      `Allowed: [${(ARTICLE_STATUS_TRANSITIONS[currentStatus] || []).join(', ')}]`
    );
  }

  return {
    ...article,
    status: targetStatus,
    status_updated_at: nowISO(),
    updated_at: nowISO()
  };
}

/**
 * Get all valid next states for a given status.
 * @param {string} currentStatus - Current ARTICLE_STATUS value
 * @returns {string[]} Array of valid target statuses
 */
export function getNextStates(currentStatus) {
  return ARTICLE_STATUS_TRANSITIONS[currentStatus] || [];
}

/**
 * Check if a status is a terminal state (no further transitions possible).
 * Terminal states: published, rejected, duplicate
 * @param {string} status - ARTICLE_STATUS value
 * @returns {boolean}
 */
export function isTerminalState(status) {
  const next = ARTICLE_STATUS_TRANSITIONS[status];
  return Array.isArray(next) && next.length === 0;
}

/**
 * Get the responsible team for a given transition.
 * @param {string} from - Source ARTICLE_STATUS
 * @param {string} to - Target ARTICLE_STATUS
 * @returns {string|null} Team identifier or null if transition is invalid
 */
export function getTransitionOwner(from, to) {
  const OWNERS = {
    [`${ARTICLE_STATUS.CRAWLED}->${ARTICLE_STATUS.FILTERED}`]: 'T02',
    [`${ARTICLE_STATUS.FILTERED}->${ARTICLE_STATUS.DEDUPLICATED}`]: 'T02',
    [`${ARTICLE_STATUS.DEDUPLICATED}->${ARTICLE_STATUS.ANALYZED}`]: 'T03',
    [`${ARTICLE_STATUS.ANALYZED}->${ARTICLE_STATUS.VALIDATED}`]: 'T03',
    [`${ARTICLE_STATUS.ANALYZED}->${ARTICLE_STATUS.REJECTED}`]: 'T03',
    [`${ARTICLE_STATUS.VALIDATED}->${ARTICLE_STATUS.PUBLISHED}`]: 'T01',
    [`${ARTICLE_STATUS.CRAWLED}->${ARTICLE_STATUS.REJECTED}`]: 'T02',
    [`${ARTICLE_STATUS.FILTERED}->${ARTICLE_STATUS.REJECTED}`]: 'T02',
    [`${ARTICLE_STATUS.DEDUPLICATED}->${ARTICLE_STATUS.DUPLICATE}`]: 'T02',
  };

  return OWNERS[`${from}->${to}`] || null;
}

export default {
  canTransitionStatus,
  transitionStatus,
  getNextStates,
  isTerminalState,
  getTransitionOwner,
  ARTICLE_STATUS,
  ARTICLE_STATUS_TRANSITIONS
};
