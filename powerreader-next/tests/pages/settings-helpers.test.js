/**
 * Unit tests for settings-helpers.js
 *
 * Tests: formatVRAM, formatBenchmarkDate, formatBenchmarkMode
 */
import { describe, it, expect } from 'vitest';
import {
  formatVRAM,
  formatBenchmarkDate,
  formatBenchmarkMode,
} from '../../src/lib/pages/settings-helpers.js';

// ══════════════════════════════════════════════
// 1. formatVRAM
// ══════════════════════════════════════════════

describe('formatVRAM', () => {
  it('returns "未知" for 0', () => {
    expect(formatVRAM(0)).toBe('未知');
  });

  it('returns "未知" for falsy values', () => {
    expect(formatVRAM(null)).toBe('未知');
    expect(formatVRAM(undefined)).toBe('未知');
  });

  it('returns MB for values < 1024', () => {
    expect(formatVRAM(512)).toBe('512 MB');
    expect(formatVRAM(256)).toBe('256 MB');
  });

  it('returns GB for values >= 1024 (exact)', () => {
    expect(formatVRAM(1024)).toBe('1 GB');
    expect(formatVRAM(2048)).toBe('2 GB');
    expect(formatVRAM(4096)).toBe('4 GB');
    expect(formatVRAM(8192)).toBe('8 GB');
    expect(formatVRAM(16384)).toBe('16 GB');
  });

  it('returns GB with one decimal for non-exact values', () => {
    expect(formatVRAM(6144)).toBe('6 GB');
    expect(formatVRAM(3072)).toBe('3 GB');
    // e.g. 1536 MB = 1.5 GB
    expect(formatVRAM(1536)).toBe('1.5 GB');
  });

  it('does not show .0 for exact GB values', () => {
    const result = formatVRAM(2048);
    expect(result).not.toContain('.0');
    expect(result).toBe('2 GB');
  });
});

// ══════════════════════════════════════════════
// 2. formatBenchmarkDate
// ══════════════════════════════════════════════

describe('formatBenchmarkDate', () => {
  it('formats ISO string to human-readable TW locale date', () => {
    const iso = '2026-03-09T08:48:23.456Z';
    const result = formatBenchmarkDate(iso);
    // Should contain year, month, day and time components
    expect(result).toContain('2026');
    expect(result).toMatch(/\d{1,2}/); // has day/time numbers
  });

  it('returns "—" for falsy input', () => {
    expect(formatBenchmarkDate(null)).toBe('—');
    expect(formatBenchmarkDate(undefined)).toBe('—');
    expect(formatBenchmarkDate('')).toBe('—');
  });

  it('returns "—" for invalid date string', () => {
    expect(formatBenchmarkDate('not-a-date')).toBe('—');
  });

  it('returns localized format with date and time', () => {
    const iso = '2026-06-15T14:30:00.000Z';
    const result = formatBenchmarkDate(iso);
    // Should have both date and time info
    expect(result).toContain('2026');
    // Should not be the raw ISO string
    expect(result).not.toContain('T');
    expect(result).not.toContain('Z');
  });
});

// ══════════════════════════════════════════════
// 3. formatBenchmarkMode
// ══════════════════════════════════════════════

describe('formatBenchmarkMode', () => {
  it('returns green label for gpu mode', () => {
    const result = formatBenchmarkMode('gpu');
    expect(result.color).toContain('controversy-low');
    expect(result.text).toBeTruthy();
  });

  it('returns secondary label for cpu mode', () => {
    const result = formatBenchmarkMode('cpu');
    expect(result.color).toContain('text-secondary');
    expect(result.text).toBeTruthy();
  });

  it('returns red label for none mode', () => {
    const result = formatBenchmarkMode('none');
    expect(result.color).toContain('bias-extreme');
    expect(result.text).toBeTruthy();
  });

  it('returns red label for unknown mode', () => {
    const result = formatBenchmarkMode('unknown');
    expect(result.color).toContain('bias-extreme');
  });

  it('all modes return { text, color } shape', () => {
    for (const mode of ['gpu', 'cpu', 'none']) {
      const result = formatBenchmarkMode(mode);
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('color');
      expect(typeof result.text).toBe('string');
      expect(typeof result.color).toBe('string');
    }
  });
});
