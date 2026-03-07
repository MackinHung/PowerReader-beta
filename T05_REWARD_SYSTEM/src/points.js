/**
 * T05 - Core Points Engine
 *
 * Handles the points lifecycle:
 *   earn (0.1 pt per valid analysis) -> accumulate -> convert to vote rights (Phase 2+)
 *
 * All points stored as integer cents (10 cents = 0.1 pt, 1000 cents = 10 pts).
 * This eliminates floating-point precision errors.
 *
 * Storage: Cloudflare D1 (users table + reward_dedup table)
 * See: src/workers/migrations/0003_t05_reward.sql
 *
 * Dependencies:
 *   - Cloudflare D1: powerreader-db (provisioned by T01)
 *   - shared/config.js: REWARD.* constants
 *   - shared/enums.js: REWARD_STATUS
 *
 * @module T05/points
 */

// ── Constants ────────────────────────────────────────────────
const POINTS_PER_VALID_ANALYSIS_CENTS = 10; // 10 cents = 0.1 pt
const POINTS_PER_VOTE_RIGHT_CENTS = 1000;   // 1000 cents = 10 pts = 1 vote right
const DAILY_ANALYSIS_LIMIT = 50;            // max analyses per user per day
const MAX_ANALYSIS_TIME_MS = 3600000;       // 1 hour upper bound (anti-abuse)

// ── User Record Factory ─────────────────────────────────────

/**
 * Create a new user points record with default values.
 * Field names match D1 `users` table columns (KV_SCHEMA.md v2.0).
 *
 * @param {string} userHash - SHA-256 hash of user identity
 * @param {string} now      - ISO 8601 timestamp
 * @returns {Object} Fresh user record (immutable template)
 */
function createUserRecord(userHash, now) {
  return Object.freeze({
    user_hash: userHash,

    // Points
    total_points_cents: 0,    // integer cents
    contribution_count: 0,
    vote_rights: 0,           // Phase 2+: auto-calculated
    votes_used: 0,            // Phase 2+

    // Anti-gaming
    daily_analysis_count: 0,
    daily_analysis_date: now.slice(0, 10), // "YYYY-MM-DD"
    consecutive_failures: 0,
    cooldown_until: null,

    // Timestamps
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
function addPoints(current, cents = POINTS_PER_VALID_ANALYSIS_CENTS, now) {
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
    consecutive_failures: 0, // reset on success
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
function incrementDailyCount(current, todayDate, now) {
  const isNewDay = current.daily_analysis_date !== todayDate;

  return {
    ...current,
    daily_analysis_count: isNewDay ? 1 : current.daily_analysis_count + 1,
    daily_analysis_date: todayDate,
    updated_at: now,
  };
}

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
function recordFailure(current, failureThreshold = 3, cooldownSeconds = 3600, now) {
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
function checkCooldown(record, now) {
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
 * Clear cooldown if it has expired. Returns the record unchanged if no cooldown
 * or cooldown is still active.
 *
 * @param {Object} current - User record
 * @param {string} now     - ISO 8601 timestamp
 * @returns {Object} Updated record (cooldown_until set to null if expired)
 */
function clearExpiredCooldown(current, now) {
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

// ── Display Helpers ─────────────────────────────────────────

/**
 * Convert internal cents to display points.
 *
 * @param {number} cents - Points in cents (integer)
 * @returns {number} Display points (e.g. 1230 -> 12.3)
 */
function centsToDisplayPoints(cents) {
  return cents / 100;
}

/**
 * Get remaining vote rights (total earned minus used).
 *
 * @param {Object} record - User record
 * @returns {number} Available vote rights
 */
function getAvailableVoteRights(record) {
  return record.vote_rights - record.votes_used;
}

/**
 * Get anonymized display name from user_hash.
 *
 * @param {string} userHash - Full SHA-256 hash
 * @returns {string} First 8 characters
 */
function getAnonymizedName(userHash) {
  return userHash.substring(0, 8);
}

// ── D1 Repository ───────────────────────────────────────────

/**
 * Create a D1-backed repository for user points and dedup tracking.
 *
 * Replaces KV persistence layer. D1 provides:
 * - Strong consistency (vs KV eventual consistency)
 * - Transactions via db.batch() (solves T06 FIX 3: atomic writes)
 * - No write budget pressure (D1: 5M reads/day vs KV: 1000 writes/day)
 *
 * @param {Object} db - Cloudflare D1 database binding
 * @returns {Object} Repository with async methods
 */
function createD1Repository(db) {
  return {
    async getUser(userHash) {
      return db.prepare(
        "SELECT * FROM users WHERE user_hash = ?",
      ).bind(userHash).first();
    },

    async ensureUser(userHash, dateStr, now) {
      await db.prepare(
        "INSERT OR IGNORE INTO users (user_hash, daily_analysis_date, updated_at) VALUES (?, ?, ?)",
      ).bind(userHash, dateStr, now).run();
      return db.prepare(
        "SELECT * FROM users WHERE user_hash = ?",
      ).bind(userHash).first();
    },

    async updateUser(record) {
      await db.prepare(`
        UPDATE users SET
          total_points_cents = ?, contribution_count = ?, vote_rights = ?, votes_used = ?,
          daily_analysis_count = ?, daily_analysis_date = ?, consecutive_failures = ?,
          cooldown_until = ?, last_contribution_at = ?, updated_at = ?
        WHERE user_hash = ?
      `).bind(
        record.total_points_cents, record.contribution_count, record.vote_rights, record.votes_used,
        record.daily_analysis_count, record.daily_analysis_date, record.consecutive_failures,
        record.cooldown_until, record.last_contribution_at, record.updated_at,
        record.user_hash,
      ).run();
    },

    async hasArticleDuplicate(userHash, articleId) {
      const row = await db.prepare(
        "SELECT 1 FROM reward_dedup WHERE user_hash = ? AND article_id = ?",
      ).bind(userHash, articleId).first();
      return row !== null;
    },

    async hasContentDuplicate(userHash, contentHash) {
      const row = await db.prepare(
        "SELECT 1 FROM reward_dedup WHERE user_hash = ? AND content_hash = ?",
      ).bind(userHash, contentHash).first();
      return row !== null;
    },

    async persistReward(record, articleId, contentHash, now) {
      await db.batch([
        db.prepare(`
          UPDATE users SET
            total_points_cents = ?, contribution_count = ?, vote_rights = ?, votes_used = ?,
            daily_analysis_count = ?, daily_analysis_date = ?, consecutive_failures = ?,
            cooldown_until = ?, last_contribution_at = ?, updated_at = ?
          WHERE user_hash = ?
        `).bind(
          record.total_points_cents, record.contribution_count, record.vote_rights, record.votes_used,
          record.daily_analysis_count, record.daily_analysis_date, record.consecutive_failures,
          record.cooldown_until, record.last_contribution_at, record.updated_at,
          record.user_hash,
        ),
        db.prepare(
          "INSERT INTO reward_dedup (user_hash, article_id, content_hash, rewarded_at) VALUES (?, ?, ?, ?)",
        ).bind(record.user_hash, articleId, contentHash, now),
      ]);
    },
  };
}

// ── Full Reward Flow ────────────────────────────────────────

/**
 * Process a valid analysis submission: anti-gaming checks + point award.
 *
 * This is the main entry point called after T03 quality gate passes.
 *
 * Execution order (Prerequisite -> Pre-Check -> Award):
 *   Prerequisite: Cooldown check (blocks all submissions during cooldown)
 *   Pre-Check A: Daily limit (50/day)
 *   Pre-Check B: Analysis time bounds (5s min, 1h max)
 *   Pre-Check C: Article deduplication (same article URL)
 *   Pre-Check D: Content-hash deduplication (prevents mirror-source exploit)
 *   Award: +0.1 pt (atomically: UPDATE users + INSERT reward_dedup via D1 batch)
 *
 * @param {Object} repo             - Repository (D1 or memory for tests)
 * @param {string} userHash         - User identifier (SHA-256)
 * @param {string} articleId        - Article identifier (SHA-256 of primary URL)
 * @param {string} contentHash      - SHA-256 of article content (for dedup)
 * @param {number} timeSpentMs      - Time user spent analyzing (from frontend)
 * @param {Object} [options]        - Optional overrides
 * @param {number} [options.dailyLimit=50]
 * @param {number} [options.minTimeMs=5000]
 * @param {number} [options.maxTimeMs=3600000]
 * @param {number} [options.failureThreshold=3]
 * @param {number} [options.cooldownSeconds=3600]
 * @param {string} [options.now]    - Override timestamp (for testing)
 * @returns {Promise<{ success: boolean, record?: Object, error?: string, code?: number }>}
 */
async function processAnalysisReward(repo, userHash, articleId, contentHash, timeSpentMs, options = {}) {
  const {
    dailyLimit = DAILY_ANALYSIS_LIMIT,
    minTimeMs = 5000,
    maxTimeMs = MAX_ANALYSIS_TIME_MS,
    failureThreshold = 3,
    cooldownSeconds = 3600,
    now = new Date().toISOString(),
  } = options;

  const todayDate = getTodayDateString(now);

  // 0. Get or create user record + clear expired cooldown
  let record = await repo.ensureUser(userHash, todayDate, now);
  record = clearExpiredCooldown(record, now);

  // Prerequisite: Cooldown check (not a Pre-Check, but blocks all submissions)
  const cooldownStatus = checkCooldown(record, now);
  if (cooldownStatus.inCooldown) {
    return {
      success: false,
      error: `冷卻中，請等待 ${Math.ceil(cooldownStatus.remainingMs / 1000)} 秒後再試`,
      code: 429,
    };
  }

  // Pre-Check A: Daily limit
  const isNewDay = record.daily_analysis_date !== todayDate;
  const currentDailyCount = isNewDay ? 0 : record.daily_analysis_count;

  if (currentDailyCount >= dailyLimit) {
    return {
      success: false,
      error: "今日分析額度已用完，明天再來",
      code: 429,
    };
  }

  // Pre-Check B: Analysis time bounds
  if (timeSpentMs < minTimeMs) {
    return {
      success: false,
      error: "分析時間過短",
      code: 400,
    };
  }
  if (timeSpentMs > maxTimeMs) {
    return {
      success: false,
      error: "分析時間異常",
      code: 400,
    };
  }

  // Pre-Check C: Article deduplication
  const isArticleDuplicate = await repo.hasArticleDuplicate(userHash, articleId);
  if (isArticleDuplicate) {
    console.warn(`article_duplicate_rejected: user=${userHash.slice(0, 8)}, articleId=${articleId.slice(0, 8)}`);
    return {
      success: false,
      error: "已分析過此文章",
      code: 409,
    };
  }

  // Pre-Check D: Content-hash deduplication (T06 security fix)
  const isContentDuplicate = await repo.hasContentDuplicate(userHash, contentHash);
  if (isContentDuplicate) {
    console.warn(`content_duplicate_rejected: user=${userHash.slice(0, 8)}, contentHash=${contentHash.slice(0, 8)}`);
    return {
      success: false,
      error: "您已分析過相同內容的文章",
      code: 409,
    };
  }

  // Award points
  record = incrementDailyCount(record, todayDate, now);
  record = addPoints(record, POINTS_PER_VALID_ANALYSIS_CENTS, now);

  // Persist atomically: UPDATE users + INSERT reward_dedup (D1 transaction)
  await repo.persistReward(record, articleId, contentHash, now);

  return {
    success: true,
    record,
  };
}

/**
 * Process a failed analysis submission (called when T03 quality gate rejects).
 *
 * @param {Object} repo      - Repository (D1 or memory for tests)
 * @param {string} userHash  - User identifier
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, record: Object, cooldownTriggered: boolean }>}
 */
async function processAnalysisFailure(repo, userHash, options = {}) {
  const {
    failureThreshold = 3,
    cooldownSeconds = 3600,
    now = new Date().toISOString(),
  } = options;

  const todayDate = getTodayDateString(now);
  let record = await repo.ensureUser(userHash, todayDate, now);
  record = clearExpiredCooldown(record, now);
  record = recordFailure(record, failureThreshold, cooldownSeconds, now);

  await repo.updateUser(record);

  return {
    success: true,
    record,
    cooldownTriggered: record.cooldown_until !== null,
  };
}

// ── Utilities ───────────────────────────────────────────────

/**
 * Get today's date string in Asia/Taipei timezone.
 *
 * @param {string} [isoNow] - Optional ISO timestamp (defaults to now)
 * @returns {string} "YYYY-MM-DD" in Asia/Taipei
 */
function getTodayDateString(isoNow) {
  const d = isoNow ? new Date(isoNow) : new Date();
  // Cloudflare Workers support Intl
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }); // sv-SE gives YYYY-MM-DD
}

// ── Exports ─────────────────────────────────────────────────

export {
  // Constants
  POINTS_PER_VALID_ANALYSIS_CENTS,
  POINTS_PER_VOTE_RIGHT_CENTS,
  DAILY_ANALYSIS_LIMIT,
  MAX_ANALYSIS_TIME_MS,

  // Record factory
  createUserRecord,

  // Core operations
  addPoints,
  incrementDailyCount,
  recordFailure,
  checkCooldown,
  clearExpiredCooldown,

  // Display helpers
  centsToDisplayPoints,
  getAvailableVoteRights,
  getAnonymizedName,

  // D1 Repository
  createD1Repository,

  // Full flows
  processAnalysisReward,
  processAnalysisFailure,

  // Utilities
  getTodayDateString,
};
