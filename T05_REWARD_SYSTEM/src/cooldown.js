/**
 * T05 - Cooldown & Failure Management
 *
 * Pure functions for anti-cheat cooldown state management.
 * No side effects, no imports — operates entirely on record objects.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 * @module T05/cooldown
 */

/**
 * Record a failed submission (increment consecutive failures).
 * If failures reach the threshold (3), sets cooldown_until.
 *
 * @param {Object} current            - Current user record
 * @param {number} failureThreshold   - Number of failures before cooldown (default 3)
 * @param {number} cooldownSeconds    - Cooldown duration in seconds (default 3600)
 * @param {string} now                - ISO 8601 timestamp
 * @returns {Object} Updated record
 */
export function recordFailure(current, failureThreshold = 3, cooldownSeconds = 3600, now) {
  const newFailures = current.consecutive_failures + 1;

  let cooldownUntil = current.cooldown_until;
  if (newFailures >= failureThreshold) {
    const cooldownEnd = new Date(new Date(now).getTime() + cooldownSeconds * 1000);
    cooldownUntil = cooldownEnd.toISOString();
  }

  return {
    ...current,
    consecutive_failures: newFailures,
    cooldown_until: cooldownUntil,
    updated_at: now,
  };
}

/**
 * Check if a user is currently in cooldown.
 *
 * @param {Object} record - User record
 * @param {string} now    - ISO 8601 timestamp
 * @returns {{ inCooldown: boolean, remainingMs: number }}
 */
export function checkCooldown(record, now) {
  if (!record.cooldown_until) {
    return { inCooldown: false, remainingMs: 0 };
  }

  const cooldownEnd = new Date(record.cooldown_until).getTime();
  const currentTime = new Date(now).getTime();
  const remainingMs = cooldownEnd - currentTime;

  if (remainingMs <= 0) {
    return { inCooldown: false, remainingMs: 0 };
  }

  return { inCooldown: true, remainingMs };
}

/**
 * Clear cooldown if it has expired.
 *
 * @param {Object} current - User record
 * @param {string} now     - ISO 8601 timestamp
 * @returns {Object} Updated record (cooldown_until set to null if expired)
 */
export function clearExpiredCooldown(current, now) {
  const { inCooldown } = checkCooldown(current, now);
  if (current.cooldown_until && !inCooldown) {
    return {
      ...current,
      cooldown_until: null,
      consecutive_failures: 0,
      updated_at: now,
    };
  }
  return current;
}
