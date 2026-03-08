/**
 * T05 - Points Calculation (Core Arithmetic)
 *
 * Pure functions for points manipulation using integer cents.
 * All points stored as integer cents (10 cents = 0.1 pt, 1000 cents = 10 pts).
 * This eliminates floating-point precision errors.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 * @module T05/calculation
 */

// ── Constants ────────────────────────────────────────────────
export const POINTS_PER_VALID_ANALYSIS_CENTS = 10; // 10 cents = 0.1 pt
export const POINTS_PER_VOTE_RIGHT_CENTS = 1000;   // 1000 cents = 10 pts = 1 vote right
export const DAILY_ANALYSIS_LIMIT = 50;            // max analyses per user per day
export const MAX_ANALYSIS_TIME_MS = 3600000;       // 1 hour upper bound (anti-abuse)

// ── User Record Factory ─────────────────────────────────────

/**
 * Create a new user points record with default values.
 * Field names match D1 `users` table columns (migration 0003).
 *
 * @param {string} userHash - SHA-256 hash of user identity
 * @param {string} now      - ISO 8601 timestamp
 * @returns {Object} Fresh user record (immutable template)
 */
export function createUserRecord(userHash, now) {
  return Object.freeze({
    user_hash: userHash,
    total_points_cents: 0,
    contribution_count: 0,
    vote_rights: 0,
    votes_used: 0,
    daily_analysis_count: 0,
    daily_analysis_date: now.slice(0, 10),
    consecutive_failures: 0,
    cooldown_until: null,
    last_contribution_at: null,
    created_at: now,
    updated_at: now,
  });
}

// ── Core Operations ─────────────────────────────────────────

/**
 * Add points after a valid analysis submission.
 * Returns a NEW record object (immutable pattern).
 *
 * @param {Object} current       - Current user record
 * @param {number} [cents=10]    - Points to add in cents (default 0.1 pt)
 * @param {string} now           - ISO 8601 timestamp
 * @returns {Object} Updated record (new object)
 */
export function addPoints(current, cents = POINTS_PER_VALID_ANALYSIS_CENTS, now) {
  if (!current) {
    throw new Error("User record is required");
  }
  if (cents <= 0) {
    throw new Error("Points to add must be positive");
  }

  const newTotalCents = current.total_points_cents + cents;
  const newContributionCount = current.contribution_count + 1;

  return {
    ...current,
    total_points_cents: newTotalCents,
    contribution_count: newContributionCount,
    vote_rights: Math.floor(newTotalCents / POINTS_PER_VOTE_RIGHT_CENTS),
    consecutive_failures: 0,
    last_contribution_at: now,
    updated_at: now,
  };
}

/**
 * Increment the daily analysis count for a user.
 * Resets the counter if the date has changed (new day in Asia/Taipei).
 *
 * @param {Object} current   - Current user record
 * @param {string} todayDate - Today's date string "YYYY-MM-DD" in Asia/Taipei
 * @param {string} now       - ISO 8601 timestamp
 * @returns {Object} Updated record with incremented daily count
 */
export function incrementDailyCount(current, todayDate, now) {
  const isNewDay = current.daily_analysis_date !== todayDate;

  return {
    ...current,
    daily_analysis_count: isNewDay ? 1 : current.daily_analysis_count + 1,
    daily_analysis_date: todayDate,
    updated_at: now,
  };
}

// ── Display Helpers ─────────────────────────────────────────

/**
 * Convert internal cents to display points.
 * @param {number} cents - Points in cents (integer)
 * @returns {number} Display points (e.g. 1230 -> 12.3)
 */
export function centsToDisplayPoints(cents) {
  return cents / 100;
}

/**
 * Get remaining vote rights (total earned minus used).
 * @param {Object} record - User record
 * @returns {number} Available vote rights
 */
export function getAvailableVoteRights(record) {
  return record.vote_rights - record.votes_used;
}

/**
 * Get anonymized display name from user_hash.
 * @param {string} userHash - Full SHA-256 hash
 * @returns {string} First 8 characters
 */
export function getAnonymizedName(userHash) {
  return userHash.substring(0, 8);
}

// ── Utilities ───────────────────────────────────────────────

/**
 * Get today's date string in Asia/Taipei timezone.
 * @param {string} [isoNow] - Optional ISO timestamp (defaults to now)
 * @returns {string} "YYYY-MM-DD" in Asia/Taipei
 */
export function getTodayDateString(isoNow) {
  const d = isoNow ? new Date(isoNow) : new Date();
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}
