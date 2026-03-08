/**
 * T05 - Calculation Module Tests
 *
 * Tests for constants, record factory, core arithmetic, display helpers, and utilities.
 * Run with: npx vitest run tests/calculation.test.js
 */

import { describe, it, expect } from "vitest";
import {
  createUserRecord,
  addPoints,
  incrementDailyCount,
  centsToDisplayPoints,
  getAvailableVoteRights,
  getAnonymizedName,
  getTodayDateString,
  POINTS_PER_VALID_ANALYSIS_CENTS,
  POINTS_PER_VOTE_RIGHT_CENTS,
  DAILY_ANALYSIS_LIMIT,
  MAX_ANALYSIS_TIME_MS,
} from "../src/calculation.js";
import { TEST_USER_HASH, TEST_NOW, TEST_TODAY, makeRecord } from "./helpers.js";

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
