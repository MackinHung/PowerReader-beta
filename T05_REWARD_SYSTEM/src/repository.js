/**
 * T05 - D1 Repository (Data Access Layer)
 *
 * Cloudflare D1-backed repository for user points and dedup tracking.
 * Encapsulates all SQL queries — business logic should NOT contain SQL.
 *
 * Tables:
 *   - users: Points, vote rights, cooldown, daily limits
 *   - reward_dedup: Article + content hash deduplication
 *
 * Migration: src/workers/migrations/0003_t05_reward.sql
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 * @module T05/repository
 */

/**
 * Build a prepared UPDATE statement for the users table.
 * Shared by updateUser() and persistReward() to DRY the SQL.
 *
 * @param {Object} db     - Cloudflare D1 database binding
 * @param {Object} record - Full user record
 * @returns {Object} D1 prepared statement (ready for .run() or db.batch())
 * @private
 */
function _buildUserUpdateStmt(db, record) {
  return db.prepare(`
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
  );
}

/**
 * Create a D1-backed repository for user points and dedup tracking.
 *
 * @param {Object} db - Cloudflare D1 database binding
 * @returns {Object} Repository with async methods
 */
export function createD1Repository(db) {
  return {
    /**
     * Get user record by hash. Returns null if not found.
     * @param {string} userHash
     * @returns {Promise<Object|null>}
     */
    async getUser(userHash) {
      return db.prepare(
        "SELECT * FROM users WHERE user_hash = ?",
      ).bind(userHash).first();
    },

    /**
     * Ensure user exists (INSERT OR IGNORE), then return full record.
     * @param {string} userHash
     * @param {string} dateStr - Today's date "YYYY-MM-DD"
     * @param {string} now - ISO 8601 timestamp
     * @returns {Promise<Object>}
     */
    async ensureUser(userHash, dateStr, now) {
      await db.prepare(
        "INSERT OR IGNORE INTO users (user_hash, daily_analysis_date, updated_at) VALUES (?, ?, ?)",
      ).bind(userHash, dateStr, now).run();
      return db.prepare(
        "SELECT * FROM users WHERE user_hash = ?",
      ).bind(userHash).first();
    },

    /**
     * Update all mutable fields on a user record.
     * @param {Object} record - Full user record
     * @returns {Promise<void>}
     */
    async updateUser(record) {
      await _buildUserUpdateStmt(db, record).run();
    },

    /**
     * Check if user already analyzed this article_id.
     * @param {string} userHash
     * @param {string} articleId
     * @returns {Promise<boolean>}
     */
    async hasArticleDuplicate(userHash, articleId) {
      const row = await db.prepare(
        "SELECT 1 FROM reward_dedup WHERE user_hash = ? AND article_id = ?",
      ).bind(userHash, articleId).first();
      return row !== null;
    },

    /**
     * Check if user already analyzed content with this hash.
     * Prevents mirror-source exploit (same content, different URLs).
     * @param {string} userHash
     * @param {string} contentHash
     * @returns {Promise<boolean>}
     */
    async hasContentDuplicate(userHash, contentHash) {
      const row = await db.prepare(
        "SELECT 1 FROM reward_dedup WHERE user_hash = ? AND content_hash = ?",
      ).bind(userHash, contentHash).first();
      return row !== null;
    },

    /**
     * Persist reward atomically: update user + insert dedup record.
     * Uses D1 batch() for transactional guarantee.
     * @param {Object} record - Updated user record
     * @param {string} articleId
     * @param {string} contentHash
     * @param {string} now - ISO 8601 timestamp
     * @returns {Promise<void>}
     */
    async persistReward(record, articleId, contentHash, now) {
      await db.batch([
        _buildUserUpdateStmt(db, record),
        db.prepare(
          "INSERT INTO reward_dedup (user_hash, article_id, content_hash, rewarded_at) VALUES (?, ?, ?, ?)",
        ).bind(record.user_hash, articleId, contentHash, now),
      ]);
    },
  };
}
