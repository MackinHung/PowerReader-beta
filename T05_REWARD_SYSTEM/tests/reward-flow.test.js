/**
 * T05 - Reward Flow Integration Tests
 *
 * Tests for processAnalysisReward and processAnalysisFailure.
 * Run with: npx vitest run tests/reward-flow.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  processAnalysisReward,
  processAnalysisFailure,
} from "../src/reward-flow.js";
import {
  TEST_USER_HASH,
  TEST_ARTICLE_ID,
  TEST_CONTENT_HASH,
  TEST_NOW,
  TEST_TODAY,
  createMemoryRepository,
} from "./helpers.js";

// ── processAnalysisReward Integration Tests ─────────────────

describe("processAnalysisReward", () => {
  let repo;

  beforeEach(() => {
    repo = createMemoryRepository();
  });

  it("awards random points for valid submission", async () => {
    const result = await processAnalysisReward(
      repo, TEST_USER_HASH, TEST_ARTICLE_ID, TEST_CONTENT_HASH, 10000,
      { now: TEST_NOW },
    );

    expect(result.success).toBe(true);
    // Random tier: 10, 20, 30, 40, or 50 cents
    expect([10, 20, 30, 40, 50]).toContain(result.record.total_points_cents);
    expect(result.record.contribution_count).toBe(1);
    // Should return the awarded amount
    expect([10, 20, 30, 40, 50]).toContain(result.last_points_awarded_cents);
    expect(result.last_points_awarded_cents).toBe(result.record.total_points_cents);
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
    expect([10, 20, 30, 40, 50]).toContain(stored.total_points_cents);
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
