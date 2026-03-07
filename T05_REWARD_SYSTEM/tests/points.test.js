/**
 * T05 - Points Engine Unit Tests
 *
 * Tests for the core points module.
 * Run with: npx vitest run T05_REWARD_SYSTEM/tests/points.test.js
 *
 * Coverage targets: 80%+ (per project guidelines)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createUserRecord,
  addPoints,
  incrementDailyCount,
  recordFailure,
  checkCooldown,
  clearExpiredCooldown,
  centsToDisplayPoints,
  getAvailableVoteRights,
  getAnonymizedName,
  processAnalysisReward,
  processAnalysisFailure,
  getTodayDateString,
  POINTS_PER_VALID_ANALYSIS_CENTS,
  POINTS_PER_VOTE_RIGHT_CENTS,
  DAILY_ANALYSIS_LIMIT,
  MAX_ANALYSIS_TIME_MS,
} from "../src/points.js";

// ── Test Fixtures ───────────────────────────────────────────

const TEST_USER_HASH = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2";
const TEST_ARTICLE_ID = "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3";
const TEST_CONTENT_HASH = "c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4";
const TEST_NOW = "2026-03-07T10:00:00+08:00";
const TEST_TODAY = "2026-03-07";

function makeRecord(overrides = {}) {
  return {
    ...createUserRecord(TEST_USER_HASH, TEST_NOW),
    ...overrides,
  };
}

// ── Memory Repository (test double for D1) ──────────────────

function createMemoryRepository() {
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

// ── Constants Tests ─────────────────────────────────────────

describe("Constants", () => {
  it("POINTS_PER_VALID_ANALYSIS_CENTS is 10 (0.1 pt)", () => {
    expect(POINTS_PER_VALID_ANALYSIS_CENTS).toBe(10);
  });

  it("POINTS_PER_VOTE_RIGHT_CENTS is 1000 (10 pts)", () => {
    expect(POINTS_PER_VOTE_RIGHT_CENTS).toBe(1000);
  });

  it("DAILY_ANALYSIS_LIMIT is 50", () => {
    expect(DAILY_ANALYSIS_LIMIT).toBe(50);
  });

  it("MAX_ANALYSIS_TIME_MS is 3600000 (1 hour)", () => {
    expect(MAX_ANALYSIS_TIME_MS).toBe(3600000);
  });
});

// ── createUserRecord Tests ──────────────────────────────────

describe("createUserRecord", () => {
  it("creates a record with all required fields", () => {
    const record = createUserRecord(TEST_USER_HASH, TEST_NOW);

    expect(record.user_hash).toBe(TEST_USER_HASH);
    expect(record.total_points_cents).toBe(0);
    expect(record.contribution_count).toBe(0);
    expect(record.vote_rights).toBe(0);
    expect(record.votes_used).toBe(0);
    expect(record.daily_analysis_count).toBe(0);
    expect(record.consecutive_failures).toBe(0);
    expect(record.cooldown_until).toBeNull();
    expect(record.created_at).toBe(TEST_NOW);
    expect(record.updated_at).toBe(TEST_NOW);
  });

  it("extracts date correctly for daily_analysis_date", () => {
    const record = createUserRecord(TEST_USER_HASH, "2026-03-07T23:59:59+08:00");
    expect(record.daily_analysis_date).toBe("2026-03-07");
  });

  it("returns a frozen object", () => {
    const record = createUserRecord(TEST_USER_HASH, TEST_NOW);
    expect(Object.isFrozen(record)).toBe(true);
  });
});

// ── addPoints Tests ─────────────────────────────────────────

describe("addPoints", () => {
  it("adds default 10 cents (0.1 pt)", () => {
    const record = makeRecord();
    const updated = addPoints(record, undefined, TEST_NOW);

    expect(updated.total_points_cents).toBe(10);
    expect(updated.contribution_count).toBe(1);
  });

  it("does not mutate the original record", () => {
    const record = makeRecord();
    const updated = addPoints(record, 10, TEST_NOW);

    expect(record.total_points_cents).toBe(0);
    expect(updated.total_points_cents).toBe(10);
    expect(record).not.toBe(updated);
  });

  it("accumulates correctly over 100 iterations (no floating-point drift)", () => {
    let record = makeRecord();
    for (let i = 0; i < 100; i++) {
      record = addPoints(record, 10, TEST_NOW);
    }
    expect(record.total_points_cents).toBe(1000); // exactly 10.00 pts
    expect(record.contribution_count).toBe(100);
  });

  it("calculates vote_rights at threshold", () => {
    const record = makeRecord({ total_points_cents: 990 });
    const updated = addPoints(record, 10, TEST_NOW);

    expect(updated.total_points_cents).toBe(1000);
    expect(updated.vote_rights).toBe(1);
  });

  it("calculates vote_rights for multiple thresholds", () => {
    const record = makeRecord({ total_points_cents: 2990 });
    const updated = addPoints(record, 10, TEST_NOW);

    expect(updated.total_points_cents).toBe(3000);
    expect(updated.vote_rights).toBe(3);
  });

  it("resets consecutive_failures on success", () => {
    const record = makeRecord({ consecutive_failures: 2 });
    const updated = addPoints(record, 10, TEST_NOW);

    expect(updated.consecutive_failures).toBe(0);
  });

  it("throws if current is null", () => {
    expect(() => addPoints(null, 10, TEST_NOW)).toThrow("User record is required");
  });

  it("throws if cents is zero or negative", () => {
    const record = makeRecord();
    expect(() => addPoints(record, 0, TEST_NOW)).toThrow("Points to add must be positive");
    expect(() => addPoints(record, -5, TEST_NOW)).toThrow("Points to add must be positive");
  });
});

// ── incrementDailyCount Tests ───────────────────────────────

describe("incrementDailyCount", () => {
  it("increments count for same day", () => {
    const record = makeRecord({ daily_analysis_count: 5, daily_analysis_date: TEST_TODAY });
    const updated = incrementDailyCount(record, TEST_TODAY, TEST_NOW);

    expect(updated.daily_analysis_count).toBe(6);
  });

  it("resets count on new day", () => {
    const record = makeRecord({ daily_analysis_count: 49, daily_analysis_date: "2026-03-06" });
    const updated = incrementDailyCount(record, TEST_TODAY, TEST_NOW);

    expect(updated.daily_analysis_count).toBe(1);
    expect(updated.daily_analysis_date).toBe(TEST_TODAY);
  });

  it("does not mutate original", () => {
    const record = makeRecord({ daily_analysis_count: 3 });
    const updated = incrementDailyCount(record, TEST_TODAY, TEST_NOW);

    expect(record.daily_analysis_count).toBe(3);
    expect(updated.daily_analysis_count).toBe(4);
  });
});

// ── recordFailure Tests ─────────────────────────────────────

describe("recordFailure", () => {
  it("increments consecutive_failures", () => {
    const record = makeRecord({ consecutive_failures: 0 });
    const updated = recordFailure(record, 3, 3600, TEST_NOW);

    expect(updated.consecutive_failures).toBe(1);
    expect(updated.cooldown_until).toBeNull();
  });

  it("triggers cooldown at threshold", () => {
    const record = makeRecord({ consecutive_failures: 2 });
    const updated = recordFailure(record, 3, 3600, TEST_NOW);

    expect(updated.consecutive_failures).toBe(3);
    expect(updated.cooldown_until).not.toBeNull();

    const cooldownEnd = new Date(updated.cooldown_until);
    const expectedEnd = new Date(new Date(TEST_NOW).getTime() + 3600 * 1000);
    expect(cooldownEnd.getTime()).toBe(expectedEnd.getTime());
  });

  it("does not trigger cooldown below threshold", () => {
    const record = makeRecord({ consecutive_failures: 0 });
    const updated = recordFailure(record, 3, 3600, TEST_NOW);

    expect(updated.cooldown_until).toBeNull();
  });
});

// ── checkCooldown Tests ─────────────────────────────────────

describe("checkCooldown", () => {
  it("returns false when no cooldown set", () => {
    const record = makeRecord({ cooldown_until: null });
    const result = checkCooldown(record, TEST_NOW);

    expect(result.inCooldown).toBe(false);
    expect(result.remainingMs).toBe(0);
  });

  it("returns true when cooldown is active", () => {
    const future = new Date(new Date(TEST_NOW).getTime() + 1800 * 1000).toISOString();
    const record = makeRecord({ cooldown_until: future });
    const result = checkCooldown(record, TEST_NOW);

    expect(result.inCooldown).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(0);
  });

  it("returns false when cooldown has expired", () => {
    const past = new Date(new Date(TEST_NOW).getTime() - 1000).toISOString();
    const record = makeRecord({ cooldown_until: past });
    const result = checkCooldown(record, TEST_NOW);

    expect(result.inCooldown).toBe(false);
    expect(result.remainingMs).toBe(0);
  });
});

// ── clearExpiredCooldown Tests ───────────────────────────────

describe("clearExpiredCooldown", () => {
  it("clears expired cooldown and resets failures", () => {
    const past = new Date(new Date(TEST_NOW).getTime() - 1000).toISOString();
    const record = makeRecord({ cooldown_until: past, consecutive_failures: 3 });
    const updated = clearExpiredCooldown(record, TEST_NOW);

    expect(updated.cooldown_until).toBeNull();
    expect(updated.consecutive_failures).toBe(0);
  });

  it("does not change record if cooldown still active", () => {
    const future = new Date(new Date(TEST_NOW).getTime() + 3600 * 1000).toISOString();
    const record = makeRecord({ cooldown_until: future, consecutive_failures: 3 });
    const updated = clearExpiredCooldown(record, TEST_NOW);

    expect(updated.cooldown_until).toBe(future);
    expect(updated.consecutive_failures).toBe(3);
  });

  it("returns same record if no cooldown", () => {
    const record = makeRecord({ cooldown_until: null });
    const updated = clearExpiredCooldown(record, TEST_NOW);

    expect(updated).toBe(record); // same reference since no change
  });
});

// ── Display Helpers Tests ───────────────────────────────────

describe("Display Helpers", () => {
  it("centsToDisplayPoints converts correctly", () => {
    expect(centsToDisplayPoints(0)).toBe(0);
    expect(centsToDisplayPoints(10)).toBe(0.1);
    expect(centsToDisplayPoints(1000)).toBe(10);
    expect(centsToDisplayPoints(1230)).toBe(12.3);
  });

  it("getAvailableVoteRights subtracts used from total", () => {
    expect(getAvailableVoteRights({ vote_rights: 3, votes_used: 1 })).toBe(2);
    expect(getAvailableVoteRights({ vote_rights: 0, votes_used: 0 })).toBe(0);
  });

  it("getAnonymizedName returns first 8 chars", () => {
    expect(getAnonymizedName(TEST_USER_HASH)).toBe("a1b2c3d4");
  });
});

// ── processAnalysisReward Integration Tests ─────────────────

describe("processAnalysisReward", () => {
  let repo;

  beforeEach(() => {
    repo = createMemoryRepository();
  });

  it("awards points for valid submission", async () => {
    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(true);
    expect(result.record.total_points_cents).toBe(10);
    expect(result.record.contribution_count).toBe(1);
  });

  it("rejects submission with time < 5s", async () => {
    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 3000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe(400);
    expect(result.error).toContain("分析時間過短");
  });

  it("rejects submission with time > 1 hour (upper bound)", async () => {
    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 3600001,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe(400);
    expect(result.error).toContain("分析時間異常");
  });

  it("accepts submission at exactly 1 hour (boundary)", async () => {
    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 3600000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(true);
  });

  it("rejects submission when daily limit reached", async () => {
    // Pre-populate with 50 analyses today
    await repo.ensureUser(TEST_USER_HASH, TEST_TODAY, TEST_NOW);
    repo._users.set(TEST_USER_HASH, {
      ...repo._users.get(TEST_USER_HASH),
      daily_analysis_count: 50,
      daily_analysis_date: TEST_TODAY,
    });

    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe(429);
    expect(result.error).toContain("額度已用完");
  });

  it("rejects submission during cooldown", async () => {
    const future = new Date(new Date(TEST_NOW).getTime() + 1800 * 1000).toISOString();
    await repo.ensureUser(TEST_USER_HASH, TEST_TODAY, TEST_NOW);
    repo._users.set(TEST_USER_HASH, {
      ...repo._users.get(TEST_USER_HASH),
      cooldown_until: future,
      consecutive_failures: 3,
    });

    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe(429);
    expect(result.error).toContain("冷卻中");
  });

  it("persists updated record to repository", async () => {
    await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    const stored = repo._users.get(TEST_USER_HASH);
    expect(stored.total_points_cents).toBe(10);
    expect(stored.contribution_count).toBe(1);
  });

  it("resets daily count on new day", async () => {
    const yesterday = "2026-03-06T23:59:59+08:00";
    await repo.ensureUser(TEST_USER_HASH, "2026-03-06", yesterday);
    repo._users.set(TEST_USER_HASH, {
      ...repo._users.get(TEST_USER_HASH),
      daily_analysis_count: 50,
      daily_analysis_date: "2026-03-06",
    });

    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(true);
    expect(result.record.daily_analysis_count).toBe(1);
    expect(result.record.daily_analysis_date).toBe(TEST_TODAY);
  });

  it("rejects duplicate content_hash (mirror source attack)", async () => {
    const artId1 = "1111111111111111111111111111111111111111111111111111111111111111";
    const artId2 = "2222222222222222222222222222222222222222222222222222222222222222";
    const sameContent = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const result1 = await processAnalysisReward(
      repo, TEST_USER_HASH, artId1, sameContent, 10000,
      { now: TEST_NOW },
    );
    expect(result1.success).toBe(true);

    const result2 = await processAnalysisReward(
      repo, TEST_USER_HASH, artId2, sameContent, 10000,
      { now: TEST_NOW },
    );
    expect(result2.success).toBe(false);
    expect(result2.code).toBe(409);
    expect(result2.error).toContain("相同內容");
  });

  it("allows same content_hash from different users", async () => {
    const user2 = "d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5";

    const result1 = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );
    expect(result1.success).toBe(true);

    const result2 = await processAnalysisReward(
      repo, user2, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );
    expect(result2.success).toBe(true);
  });

  it("rejects duplicate article_id (same article resubmission)", async () => {
    const contentA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contentB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const result1 = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, contentA, 10000,
      { now: TEST_NOW },
    );
    expect(result1.success).toBe(true);

    const result2 = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, contentB, 10000,
      { now: TEST_NOW },
    );
    expect(result2.success).toBe(false);
    expect(result2.code).toBe(409);
    expect(result2.error).toContain("已分析過此文章");
  });

  it("allows same article_id from different users", async () => {
    const user2 = "d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5";

    const result1 = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );
    expect(result1.success).toBe(true);

    const artId2 = "3333333333333333333333333333333333333333333333333333333333333333";
    const result2 = await processAnalysisReward(
      repo, user2, TEST_ARTICLE_ID, artId2, 10000,
      { now: TEST_NOW },
    );
    expect(result2.success).toBe(true);
  });

  it("records both article and content dedup entries", async () => {
    await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    const dedupEntries = repo._dedup;
    expect(dedupEntries).toHaveLength(1);
    expect(dedupEntries[0].article_id).toBe(TEST_ARTICLE_ID);
    expect(dedupEntries[0].content_hash).toBe(TEST_CONTENT_HASH);
    expect(dedupEntries[0].rewarded_at).toBe(TEST_NOW);
  });

  it("Pre-Check C fires before Pre-Check D (article dedup before content dedup)", async () => {
    const contentX = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contentY = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const artA = "1111111111111111111111111111111111111111111111111111111111111111";

    // Submit article A with content X
    await processAnalysisReward(
      repo, TEST_USER_HASH, artA, contentX, 10000,
      { now: TEST_NOW },
    );

    // Submit article A again with different content Y
    // Should be rejected by Pre-Check C (article dedup), NOT Pre-Check D
    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, artA, contentY, 10000,
      { now: TEST_NOW },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("已分析過此文章"); // Pre-Check C, not D
  });
});

// ── processAnalysisFailure Integration Tests ────────────────

describe("processAnalysisFailure", () => {
  let repo;

  beforeEach(() => {
    repo = createMemoryRepository();
  });

  it("increments failure count", async () => {
    const result = await processAnalysisFailure(
      repo, TEST_USER_HASH,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(true);
    expect(result.record.consecutive_failures).toBe(1);
    expect(result.cooldownTriggered).toBe(false);
  });

  it("triggers cooldown after 3 failures", async () => {
    await repo.ensureUser(TEST_USER_HASH, TEST_TODAY, TEST_NOW);
    repo._users.set(TEST_USER_HASH, {
      ...repo._users.get(TEST_USER_HASH),
      consecutive_failures: 2,
    });

    const result = await processAnalysisFailure(
      repo, TEST_USER_HASH,
      { now: TEST_NOW },
    );

    expect(result.cooldownTriggered).toBe(true);
    expect(result.record.consecutive_failures).toBe(3);
    expect(result.record.cooldown_until).not.toBeNull();
  });
});

// ── getTodayDateString Tests ────────────────────────────────

describe("getTodayDateString", () => {
  it("extracts date from ISO string", () => {
    const result = getTodayDateString("2026-03-07T10:00:00+08:00");
    expect(result).toBe("2026-03-07");
  });

  it("handles midnight boundary (UTC vs Taipei)", () => {
    // 2026-03-07 00:30 in Taipei = 2026-03-06 16:30 UTC
    const result = getTodayDateString("2026-03-06T16:30:00Z");
    expect(result).toBe("2026-03-07");
  });
});
