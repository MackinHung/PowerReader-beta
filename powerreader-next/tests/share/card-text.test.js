import { describe, it, expect, beforeEach } from 'vitest';
import { wrapText, measureLine } from '$lib/share/card-text.js';

/**
 * Mock CanvasRenderingContext2D.measureText — uses char count as width approximation.
 * CJK chars ~30px, ASCII ~15px at the mocked font size.
 */
function createMockCtx() {
  return {
    measureText(text) {
      let w = 0;
      for (const ch of text) {
        w += ch.charCodeAt(0) > 255 ? 30 : 15;
      }
      return { width: w };
    },
  };
}

describe('card-text', () => {
  let ctx;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  describe('wrapText', () => {
    it('returns empty lines for empty string', () => {
      const result = wrapText(ctx, '', 300, 40);
      expect(result.lines).toEqual([]);
      expect(result.totalHeight).toBe(0);
    });

    it('returns single line for short text', () => {
      const result = wrapText(ctx, '短文', 300, 40);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toBe('短文');
    });

    it('wraps long CJK text into multiple lines', () => {
      const text = '這是一段很長的中文文字用來測試換行功能是否正常運作';
      const result = wrapText(ctx, text, 300, 40);
      expect(result.lines.length).toBeGreaterThan(1);
      // All original text should be present across all lines
      expect(result.lines.join('')).toBe(text);
    });

    it('respects maxLines and truncates with ⋯⋯', () => {
      const text = '這是一段很長的中文文字用來測試換行功能是否正常運作而且要超過三行';
      const result = wrapText(ctx, text, 300, 40, 2);
      expect(result.lines.length).toBeLessThanOrEqual(2);
      expect(result.totalHeight).toBe(80); // 2 * 40
      // Last line should end with ⋯⋯
      const lastLine = result.lines[result.lines.length - 1];
      expect(lastLine.endsWith('⋯⋯')).toBe(true);
    });

    it('does not truncate if text fits within maxLines', () => {
      const text = '短文';
      const result = wrapText(ctx, text, 300, 40, 3);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toBe('短文');
    });

    it('calculates totalHeight correctly', () => {
      const text = '這是一段很長的中文文字用來測試';
      const result = wrapText(ctx, text, 300, 50);
      expect(result.totalHeight).toBe(result.lines.length * 50);
    });

    it('handles mixed ASCII and CJK text', () => {
      const text = 'PowerReader 台灣新聞立場分析平台';
      const result = wrapText(ctx, text, 400, 40);
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
      expect(result.lines.join('')).toBe(text);
    });

    it('handles single character', () => {
      const result = wrapText(ctx, '字', 300, 40);
      expect(result.lines).toEqual(['字']);
    });

    it('handles maxLines = 1 on long text', () => {
      const text = '一段超長的文字必須被截斷到只有一行而且要加上省略符號';
      const result = wrapText(ctx, text, 300, 40, 1);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].endsWith('⋯⋯')).toBe(true);
    });
  });

  describe('measureLine', () => {
    it('returns pixel width of text', () => {
      const width = measureLine(ctx, '測試');
      expect(width).toBe(60); // 2 CJK chars × 30px
    });

    it('returns 0 for empty string', () => {
      expect(measureLine(ctx, '')).toBe(0);
    });

    it('handles ASCII text', () => {
      expect(measureLine(ctx, 'abc')).toBe(45); // 3 × 15px
    });
  });
});
