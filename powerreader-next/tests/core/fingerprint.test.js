/**
 * Unit tests for fingerprint.js
 *
 * Tests cover: hashPrompts, buildFingerprint
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock benchmark module ──
vi.mock('../../src/lib/core/benchmark.js', () => ({
  getDeviceTier: vi.fn(() => 'gpu'),
  getUserGPUSelection: vi.fn(() => ({ device: 'NVIDIA GeForce RTX 4060', vramMB: 8192 })),
  getCachedBenchmark: vi.fn(() => ({
    mode: 'gpu',
    latency_ms: 5000,
    gpu_info: {
      supported: true,
      vendor: 'nvidia',
      architecture: 'ada',
      device: 'NVIDIA GeForce RTX 4060',
      vramMB: 8192,
      gpuType: 'discrete',
      archInfo: null,
    },
    tested_at: '2026-01-01T00:00:00.000Z',
  })),
}));

import { hashPrompts, buildFingerprint } from '../../src/lib/core/fingerprint.js';

// ══════════════════════════════════════════════
// 1. hashPrompts
// ══════════════════════════════════════════════

describe('hashPrompts', () => {
  it('returns a 64-char hex string (SHA-256)', async () => {
    const hash = await hashPrompts('hello', 'world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic output for same input', async () => {
    const a = await hashPrompts('system prompt', 'user message');
    const b = await hashPrompts('system prompt', 'user message');
    expect(a).toBe(b);
  });

  it('produces different output for different input', async () => {
    const a = await hashPrompts('prompt A');
    const b = await hashPrompts('prompt B');
    expect(a).not.toBe(b);
  });

  it('handles empty strings', async () => {
    const hash = await hashPrompts('', '');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles unicode (CJK) content', async () => {
    const hash = await hashPrompts('分析以下新聞的政治立場', '總統出席活動');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('joins multiple inputs with separator', async () => {
    const combined = await hashPrompts('a', 'b', 'c');
    const single = await hashPrompts('a\n---\nb\n---\nc');
    expect(combined).toBe(single);
  });
});

// ══════════════════════════════════════════════
// 2. buildFingerprint
// ══════════════════════════════════════════════

describe('buildFingerprint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  it('builds a complete fingerprint with all fields', () => {
    const fp = buildFingerprint({
      modelId: 'Qwen3-8B-q4f16_1-MLC',
      promptHash: 'abc123',
      pass1Tokens: 100,
      pass2Tokens: 200,
      pass1TimeMs: 5000,
      pass2TimeMs: 10000,
    });

    expect(fp).toEqual({
      model_id: 'Qwen3-8B-q4f16_1-MLC',
      prompt_hash: 'abc123',
      pass1_tokens: 100,
      pass2_tokens: 200,
      pass1_time_ms: 5000,
      pass2_time_ms: 10000,
      tokens_per_second: 20,       // 300 tokens / 15 seconds
      gpu_tier: 'gpu',
      gpu_device: 'NVIDIA GeForce RTX 4060',
      timestamp: '2026-03-20T12:00:00.000Z',
    });
  });

  it('calculates tokens_per_second correctly', () => {
    const fp = buildFingerprint({
      modelId: 'test',
      promptHash: 'hash',
      pass1Tokens: 50,
      pass2Tokens: 150,
      pass1TimeMs: 2000,
      pass2TimeMs: 3000,
    });

    // 200 tokens / 5 seconds = 40 tok/s
    expect(fp.tokens_per_second).toBe(40);
  });

  it('handles zero time (avoids division by zero)', () => {
    const fp = buildFingerprint({
      modelId: 'test',
      promptHash: 'hash',
      pass1Tokens: 100,
      pass2Tokens: 0,
      pass1TimeMs: 0,
      pass2TimeMs: 0,
    });

    expect(fp.tokens_per_second).toBe(0);
  });

  it('handles pass2 timeout (pass2Tokens = 0)', () => {
    const fp = buildFingerprint({
      modelId: 'Qwen3-8B-q4f16_1-MLC',
      promptHash: 'hash',
      pass1Tokens: 120,
      pass2Tokens: 0,
      pass1TimeMs: 4000,
      pass2TimeMs: 30000,
    });

    expect(fp.pass2_tokens).toBe(0);
    // 120 tokens / 34 seconds ≈ 3.53
    expect(fp.tokens_per_second).toBe(3.53);
  });

  it('reads gpu_tier and gpu_device from cached benchmark', () => {
    const fp = buildFingerprint({
      modelId: 'test',
      promptHash: 'hash',
      pass1Tokens: 10,
      pass2Tokens: 10,
      pass1TimeMs: 1000,
      pass2TimeMs: 1000,
    });

    expect(fp.gpu_tier).toBe('gpu');
    expect(fp.gpu_device).toBe('NVIDIA GeForce RTX 4060');
  });

  it('uses ISO 8601 timestamp', () => {
    const fp = buildFingerprint({
      modelId: 'test',
      promptHash: 'hash',
      pass1Tokens: 0,
      pass2Tokens: 0,
      pass1TimeMs: 0,
      pass2TimeMs: 0,
    });

    expect(fp.timestamp).toBe('2026-03-20T12:00:00.000Z');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ══════════════════════════════════════════════
// 3. buildFingerprint — no benchmark cached
// ══════════════════════════════════════════════

describe('buildFingerprint without benchmark', () => {
  it('falls back to cpu tier and empty device when no data', async () => {
    const benchMod = await import('../../src/lib/core/benchmark.js');
    vi.mocked(benchMod.getDeviceTier).mockReturnValueOnce('cpu');
    vi.mocked(benchMod.getUserGPUSelection).mockReturnValueOnce(null);
    vi.mocked(benchMod.getCachedBenchmark).mockReturnValueOnce(null);

    const fp = buildFingerprint({
      modelId: 'server',
      promptHash: 'hash',
      pass1Tokens: 0,
      pass2Tokens: 0,
      pass1TimeMs: 2000,
      pass2TimeMs: 0,
    });

    expect(fp.gpu_tier).toBe('cpu');
    expect(fp.gpu_device).toBe('');
  });
});
