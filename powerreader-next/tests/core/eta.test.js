/**
 * Unit tests for eta.js — ETA Estimation for Dual-Pass Inference
 *
 * Tests cover: recordLatency, estimateRemaining, getDualPassProgress
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let mod;

async function loadModule() {
  return await import('../../src/lib/core/eta.js');
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mod = await loadModule();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. recordLatency
// ══════════════════════════════════════════════

describe('recordLatency', () => {
  it('stores value in localStorage', () => {
    mod.recordLatency('gpu', 'pass1', 5000);

    const raw = localStorage.getItem('pr_eta_gpu_pass1');
    expect(raw).not.toBeNull();
    const arr = JSON.parse(raw);
    expect(arr).toContain(5000);
  });

  it('key format is pr_eta_{tier}_{pass}', () => {
    mod.recordLatency('cpu', 'pass2', 12000);

    expect(localStorage.getItem('pr_eta_cpu_pass2')).not.toBeNull();
    // Verify other keys are not created
    expect(localStorage.getItem('pr_eta_gpu_pass2')).toBeNull();
    expect(localStorage.getItem('pr_eta_cpu_pass1')).toBeNull();
  });

  it('appends to existing entries', () => {
    mod.recordLatency('gpu', 'pass1', 5000);
    mod.recordLatency('gpu', 'pass1', 6000);

    const arr = JSON.parse(localStorage.getItem('pr_eta_gpu_pass1'));
    expect(arr).toHaveLength(2);
    expect(arr).toEqual([5000, 6000]);
  });

  it('maintains rolling window max 10', () => {
    for (let i = 1; i <= 12; i++) {
      mod.recordLatency('gpu', 'pass1', i * 1000);
    }

    const arr = JSON.parse(localStorage.getItem('pr_eta_gpu_pass1'));
    expect(arr).toHaveLength(10);
    // Should keep the 10 most recent (3000..12000)
    expect(arr[0]).toBe(3000);
    expect(arr[9]).toBe(12000);
  });

  it('with different tiers stores separately', () => {
    mod.recordLatency('gpu', 'pass1', 5000);
    mod.recordLatency('cpu', 'pass1', 15000);

    const gpuArr = JSON.parse(localStorage.getItem('pr_eta_gpu_pass1'));
    const cpuArr = JSON.parse(localStorage.getItem('pr_eta_cpu_pass1'));
    expect(gpuArr).toEqual([5000]);
    expect(cpuArr).toEqual([15000]);
  });

  it('with different passes stores separately', () => {
    mod.recordLatency('gpu', 'pass1', 4000);
    mod.recordLatency('gpu', 'pass2', 8000);

    const p1Arr = JSON.parse(localStorage.getItem('pr_eta_gpu_pass1'));
    const p2Arr = JSON.parse(localStorage.getItem('pr_eta_gpu_pass2'));
    expect(p1Arr).toEqual([4000]);
    expect(p2Arr).toEqual([8000]);
  });
});

// ══════════════════════════════════════════════
// 2. estimateRemaining
// ══════════════════════════════════════════════

describe('estimateRemaining', () => {
  it('returns null with no history', () => {
    const result = mod.estimateRemaining('gpu', 'pass1', 2000);
    expect(result).toBeNull();
  });

  it('returns null with empty array', () => {
    localStorage.setItem('pr_eta_gpu_pass1', '[]');
    const result = mod.estimateRemaining('gpu', 'pass1', 2000);
    expect(result).toBeNull();
  });

  it('returns estimate with single data point', () => {
    mod.recordLatency('gpu', 'pass1', 5000);

    const result = mod.estimateRemaining('gpu', 'pass1', 2000);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('remainingMs');
    expect(result).toHaveProperty('confidence');
    // median of [5000] = sorted[floor(1/2)] = sorted[0] = 5000
    // remaining = 5000 - 2000 = 3000
    expect(result.remainingMs).toBe(3000);
  });

  it('uses median (odd number of entries)', () => {
    // entries: [7000, 3000, 5000] -> sorted: [3000, 5000, 7000]
    // median = sorted[floor(3/2)] = sorted[1] = 5000
    mod.recordLatency('gpu', 'pass1', 7000);
    mod.recordLatency('gpu', 'pass1', 3000);
    mod.recordLatency('gpu', 'pass1', 5000);

    const result = mod.estimateRemaining('gpu', 'pass1', 1000);
    expect(result).not.toBeNull();
    // median=5000, remaining=5000-1000=4000
    expect(result.remainingMs).toBe(4000);
  });

  it('uses median (even number of entries)', () => {
    // entries: [8000, 2000, 6000, 4000] -> sorted: [2000, 4000, 6000, 8000]
    // median = sorted[floor(4/2)] = sorted[2] = 6000
    mod.recordLatency('gpu', 'pass1', 8000);
    mod.recordLatency('gpu', 'pass1', 2000);
    mod.recordLatency('gpu', 'pass1', 6000);
    mod.recordLatency('gpu', 'pass1', 4000);

    const result = mod.estimateRemaining('gpu', 'pass1', 1000);
    expect(result).not.toBeNull();
    // median=6000, remaining=6000-1000=5000
    expect(result.remainingMs).toBe(5000);
  });

  it('confidence increases with more data', () => {
    mod.recordLatency('gpu', 'pass1', 5000);
    const r1 = mod.estimateRemaining('gpu', 'pass1', 1000);

    mod.recordLatency('gpu', 'pass1', 5100);
    mod.recordLatency('gpu', 'pass1', 4900);
    mod.recordLatency('gpu', 'pass1', 5200);
    mod.recordLatency('gpu', 'pass1', 4800);
    const r5 = mod.estimateRemaining('gpu', 'pass1', 1000);

    expect(r1).not.toBeNull();
    expect(r5).not.toBeNull();
    // 1 entry: confidence = 0.3 + 0*0.072 = 0.3
    // 5 entries: confidence = 0.3 + 4*0.072 = 0.588
    expect(r1.confidence).toBeCloseTo(0.3, 2);
    expect(r5.confidence).toBeCloseTo(0.588, 2);
    expect(r5.confidence).toBeGreaterThan(r1.confidence);
  });

  it('remainingMs never negative', () => {
    mod.recordLatency('gpu', 'pass1', 3000);

    // elapsed well past median
    const result = mod.estimateRemaining('gpu', 'pass1', 10000);
    expect(result).not.toBeNull();
    expect(result.remainingMs).toBe(0);
  });
});

// ══════════════════════════════════════════════
// 3. getDualPassProgress
// ══════════════════════════════════════════════

describe('getDualPassProgress', () => {
  it('returns ~0 for preparing', () => {
    const progress = mod.getDualPassProgress('preparing', 0, 'gpu');
    // Implementation returns 0.02
    expect(progress).toBeCloseTo(0.02, 2);
  });

  it('returns ~0.07 for loading_model', () => {
    const progress = mod.getDualPassProgress('loading_model', 500, 'gpu');
    expect(progress).toBeCloseTo(0.07, 2);
  });

  it('returns 0.1-0.5 range for pass1_running', () => {
    // No history => returns 0.3 (fallback)
    const progress = mod.getDualPassProgress('pass1_running', 3000, 'gpu');
    expect(progress).toBeGreaterThanOrEqual(0.1);
    expect(progress).toBeLessThanOrEqual(0.5);
  });

  it('returns 0.5-0.95 range for pass2_running', () => {
    // No history => returns 0.7 (fallback)
    const progress = mod.getDualPassProgress('pass2_running', 8000, 'gpu');
    expect(progress).toBeGreaterThanOrEqual(0.5);
    expect(progress).toBeLessThanOrEqual(0.95);
  });

  it('returns 1 for done', () => {
    const progress = mod.getDualPassProgress('done', 15000, 'gpu');
    expect(progress).toBe(1);
  });
});
