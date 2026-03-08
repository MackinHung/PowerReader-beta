/**
 * T05 - Cooldown Module Tests
 *
 * Tests for cooldown management and failure tracking.
 * Run with: npx vitest run tests/cooldown.test.js
 */

import { describe, it, expect } from "vitest";
import {
  recordFailure,
  checkCooldown,
  clearExpiredCooldown,
} from "../src/cooldown.js";
import { TEST_NOW, makeRecord } from "./helpers.js";

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
