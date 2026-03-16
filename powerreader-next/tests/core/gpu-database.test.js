/**
 * Unit tests for gpu-database.js
 *
 * Tests: lookupGPU — GPU device name → VRAM lookup
 */
import { describe, it, expect } from 'vitest';
import { lookupGPU, lookupByArch } from '../../src/lib/core/gpu-database.js';

// ══════════════════════════════════════════════
// 1. NVIDIA Discrete GPUs
// ══════════════════════════════════════════════

describe('lookupGPU — NVIDIA', () => {
  it('matches RTX 4090 (24 GB)', () => {
    const result = lookupGPU('NVIDIA GeForce RTX 4090');
    expect(result.vramMB).toBe(24576);
    expect(result.type).toBe('discrete');
  });

  it('matches RTX 3060 (12 GB)', () => {
    const result = lookupGPU('GeForce RTX 3060');
    expect(result.vramMB).toBe(12288);
    expect(result.type).toBe('discrete');
  });

  it('matches RTX 4070 Ti SUPER (16 GB) before RTX 4070 Ti (12 GB)', () => {
    const tiSuper = lookupGPU('GeForce RTX 4070 Ti SUPER');
    expect(tiSuper.vramMB).toBe(16384);

    const ti = lookupGPU('GeForce RTX 4070 Ti');
    expect(ti.vramMB).toBe(12288);
  });

  it('matches RTX 4080 SUPER (16 GB)', () => {
    const result = lookupGPU('NVIDIA GeForce RTX 4080 SUPER');
    expect(result.vramMB).toBe(16384);
  });

  it('matches GTX 1080 Ti (11 GB)', () => {
    const result = lookupGPU('GeForce GTX 1080 Ti');
    expect(result.vramMB).toBe(11264);
    expect(result.type).toBe('discrete');
  });

  it('matches RTX 5090 (32 GB)', () => {
    const result = lookupGPU('NVIDIA GeForce RTX 5090');
    expect(result.vramMB).toBe(32768);
  });

  it('is case-insensitive', () => {
    const result = lookupGPU('nvidia geforce rtx 3060');
    expect(result.vramMB).toBe(12288);
  });
});

// ══════════════════════════════════════════════
// 2. AMD Discrete GPUs
// ══════════════════════════════════════════════

describe('lookupGPU — AMD', () => {
  it('matches RX 7900 XTX (24 GB)', () => {
    const result = lookupGPU('AMD Radeon RX 7900 XTX');
    expect(result.vramMB).toBe(24576);
    expect(result.type).toBe('discrete');
  });

  it('matches RX 7600 (8 GB)', () => {
    const result = lookupGPU('Radeon RX 7600');
    expect(result.vramMB).toBe(8192);
  });

  it('matches RX 9070 XT (16 GB)', () => {
    const result = lookupGPU('AMD Radeon RX 9070 XT');
    expect(result.vramMB).toBe(16384);
  });

  it('matches RX 6600 XT (8 GB) before RX 6600 (8 GB)', () => {
    const xt = lookupGPU('Radeon RX 6600 XT');
    expect(xt.vramMB).toBe(8192);

    const base = lookupGPU('Radeon RX 6600');
    expect(base.vramMB).toBe(8192);
  });
});

// ══════════════════════════════════════════════
// 3. Intel Discrete GPUs
// ══════════════════════════════════════════════

describe('lookupGPU — Intel Arc', () => {
  it('matches Arc A770 (16 GB)', () => {
    const result = lookupGPU('Intel(R) Arc(TM) A770');
    expect(result.vramMB).toBe(16384);
    expect(result.type).toBe('discrete');
  });

  it('matches Arc B580 (12 GB)', () => {
    const result = lookupGPU('Intel Arc B580');
    expect(result.vramMB).toBe(12288);
    expect(result.type).toBe('discrete');
  });
});

// ══════════════════════════════════════════════
// 4. Integrated / Unified GPUs
// ══════════════════════════════════════════════

describe('lookupGPU — Integrated / Unified', () => {
  it('matches Apple M-series as unified memory', () => {
    const result = lookupGPU('Apple M2 Pro');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('unified');
  });

  it('matches Apple M1 as unified memory', () => {
    const result = lookupGPU('Apple M1');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('unified');
  });

  it('matches Intel UHD as integrated', () => {
    const result = lookupGPU('Intel(R) UHD Graphics 630');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('integrated');
  });

  it('matches Intel Iris Xe as integrated', () => {
    const result = lookupGPU('Intel(R) Iris(R) Xe Graphics');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('integrated');
  });

  it('matches AMD APU integrated graphics', () => {
    const result = lookupGPU('AMD Radeon Graphics');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('integrated');
  });
});

// ══════════════════════════════════════════════
// 5. Edge Cases
// ══════════════════════════════════════════════

describe('lookupGPU — Edge Cases', () => {
  it('returns unknown for empty string', () => {
    const result = lookupGPU('');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for null', () => {
    const result = lookupGPU(null);
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    const result = lookupGPU(undefined);
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for unrecognized device', () => {
    const result = lookupGPU('Some Future GPU 9999');
    expect(result.vramMB).toBe(0);
    expect(result.type).toBe('unknown');
  });

  it('result is always { vramMB, type } shape', () => {
    for (const name of ['RTX 4090', 'Apple M3', 'Intel UHD 770', '', null]) {
      const result = lookupGPU(name);
      expect(result).toHaveProperty('vramMB');
      expect(result).toHaveProperty('type');
      expect(typeof result.vramMB).toBe('number');
      expect(typeof result.type).toBe('string');
    }
  });
});

// ══════════════════════════════════════════════
// 6. lookupByArch — Architecture Fallback
// ══════════════════════════════════════════════

describe('lookupByArch', () => {
  it('matches NVIDIA turing architecture', () => {
    const result = lookupByArch('nvidia', 'turing');
    expect(result).not.toBeNull();
    expect(result.label).toBe('NVIDIA Turing');
    expect(result.series).toBe('RTX 20 / GTX 16');
    expect(result.vramRange).toBe('4 ~ 11 GB');
  });

  it('matches NVIDIA ampere architecture', () => {
    const result = lookupByArch('nvidia', 'ampere');
    expect(result).not.toBeNull();
    expect(result.label).toBe('NVIDIA Ampere');
    expect(result.series).toBe('RTX 30');
  });

  it('matches AMD rdna3 architecture', () => {
    const result = lookupByArch('amd', 'rdna3');
    expect(result).not.toBeNull();
    expect(result.label).toBe('AMD RDNA 3');
    expect(result.series).toBe('RX 7000');
  });

  it('returns null for empty vendor and arch', () => {
    expect(lookupByArch('', '')).toBeNull();
    expect(lookupByArch(null, null)).toBeNull();
  });

  it('returns null for unknown architecture', () => {
    expect(lookupByArch('nvidia', 'future_arch_2030')).toBeNull();
  });

  it('is case-insensitive', () => {
    const result = lookupByArch('NVIDIA', 'TURING');
    expect(result).not.toBeNull();
    expect(result.label).toBe('NVIDIA Turing');
  });
});
