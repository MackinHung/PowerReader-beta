/**
 * T05 - Shared Test Infrastructure
 *
 * Common fixtures and test doubles for all T05 test files.
 *
 * @module T05/tests/helpers
 */

import { createUserRecord } from "../src/calculation.js";

// ── Test Constants ──────────────────────────────────────────

export const TEST_USER_HASH = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2";
export const TEST_ARTICLE_ID = "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3";
export const TEST_CONTENT_HASH = "c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4";
export const TEST_NOW = "2026-03-07T10:00:00+08:00";
export const TEST_TODAY = "2026-03-07";

// ── Record Factory ──────────────────────────────────────────

/**
 * Create a test user record with optional overrides.
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} User record
 */
export function makeRecord(overrides = {}) {
  return {
    ...createUserRecord(TEST_USER_HASH, TEST_NOW),
    ...overrides,
  };
}

// ── Memory Repository (test double for D1) ──────────────────

/**
 * Create an in-memory repository that mirrors the D1 repository interface.
 * Used as a test double for integration tests.
 * @returns {Object} Memory-backed repository
 */
export function createMemoryRepository() {
  const users = new Map();
  const dedup = [];

  return {
    async getUser(userHash) {
      const user = users.get(userHash);
      return user ? { ...user } : null;
    },
    async ensureUser(userHash, dateStr, now) {
      if (!users.has(userHash)) {
        users.set(userHash, {
          user_hash: userHash,
          total_points_cents: 0,
          contribution_count: 0,
          vote_rights: 0,
          votes_used: 0,
          daily_analysis_count: 0,
          daily_analysis_date: dateStr,
          consecutive_failures: 0,
          cooldown_until: null,
          last_contribution_at: null,
          created_at: now,
          updated_at: now,
        });
      }
      return { ...users.get(userHash) };
    },
    async updateUser(record) {
      users.set(record.user_hash, { ...record });
    },
    async hasArticleDuplicate(userHash, articleId) {
      return dedup.some(d => d.user_hash === userHash && d.article_id === articleId);
    },
    async hasContentDuplicate(userHash, contentHash) {
      return dedup.some(d => d.user_hash === userHash && d.content_hash === contentHash);
    },
    async persistReward(record, articleId, contentHash, now) {
      users.set(record.user_hash, { ...record });
      dedup.push({
        user_hash: record.user_hash,
        article_id: articleId,
        content_hash: contentHash,
        rewarded_at: now,
      });
    },
    _users: users,
    _dedup: dedup,
  };
}
