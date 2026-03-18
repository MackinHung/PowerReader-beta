/**
 * T05 - Core Points Engine (Barrel Re-export)
 *
 * Split into:
 *   calculation.js — Pure point arithmetic, record factory, display helpers
 *   cooldown.js    — Anti-cheat cooldown & failure management
 *   repository.js  — D1 data access layer (SQL queries)
 *   reward-flow.js — Business flow orchestration
 *
 * This barrel file preserves the existing import interface.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 * @module T05/index
 */

export {
  // Constants
  POINTS_PER_VALID_ANALYSIS_CENTS,
  POINTS_PER_VOTE_RIGHT_CENTS,
  DAILY_ANALYSIS_LIMIT,
  MAX_ANALYSIS_TIME_MS,
  POINT_TIERS,

  // Record factory
  createUserRecord,

  // Core operations
  addPoints,
  incrementDailyCount,

  // Random reward
  rollPointReward,

  // Display helpers
  centsToDisplayPoints,
  getAvailableVoteRights,
  getAnonymizedName,

  // Utilities
  getTodayDateString,
} from './calculation.js';

export {
  // Anti-cheat
  recordFailure,
  checkCooldown,
  clearExpiredCooldown,
} from './cooldown.js';

export {
  // Full flows
  processAnalysisReward,
  processAnalysisFailure,
} from './reward-flow.js';

export {
  // D1 Repository
  createD1Repository,
} from './repository.js';
