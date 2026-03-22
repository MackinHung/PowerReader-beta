import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderArticleCard, renderEventCard } from '$lib/share/card-renderer.js';

/**
 * Mock Canvas/DOM APIs since we're in jsdom.
 * jsdom does not support canvas natively, so we mock the entire chain.
 */

function createMockCtx() {
  const calls = [];
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    font: '',
    fillRect: vi.fn((...args) => calls.push(['fillRect', ...args])),
    fillText: vi.fn((...args) => calls.push(['fillText', ...args])),
    strokeText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn((text) => ({
      width: [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 30 : 15), 0),
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  };
}

let mockCtx;
let mockBlob;

beforeEach(() => {
  mockCtx = createMockCtx();
  mockBlob = new Blob(['fake-png'], { type: 'image/png' });

  // Mock document.createElement('canvas')
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => mockCtx,
        toBlob: (cb, type) => cb(mockBlob),
      };
    }
    // Fallback for other elements (e.g., 'a' for download)
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  });
});

describe('card-renderer', () => {
  describe('renderArticleCard', () => {
    const baseData = {
      title: '測試文章標題',
      source: '自由時報',
      biasScore: 30,
      isPolitical: true,
      campRatio: { green: 60, white: 15, blue: 25 },
      emotionIntensity: 65,
      points: ['論述重點一', '論述重點二', '論述重點三'],
    };

    it('returns a Blob', async () => {
      const blob = await renderArticleCard(baseData);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('draws background', async () => {
      await renderArticleCard(baseData);
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1350);
    });

    it('draws header text', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('PowerReader'))).toBe(true);
    });

    it('draws title', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('測試文章標題'))).toBe(true);
    });

    it('draws source', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('自由時報'))).toBe(true);
    });

    it('draws bias spectrum labels', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t === '偏綠')).toBe(true);
      expect(fillTextCalls.some(t => t === '偏藍')).toBe(true);
    });

    it('draws camp bar legend', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('民進黨'))).toBe(true);
    });

    it('draws emotion chip', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('情緒強度'))).toBe(true);
    });

    it('draws points', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('論述重點一'))).toBe(true);
    });

    it('draws footer', async () => {
      await renderArticleCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('powerreader.pages.dev'))).toBe(true);
      expect(fillTextCalls.some(t => t.includes('透過公民驅動透明'))).toBe(true);
    });

    it('handles non-political article (no bias/camp)', async () => {
      const data = {
        ...baseData,
        isPolitical: false,
        biasScore: null,
        campRatio: null,
      };
      const blob = await renderArticleCard(data);
      expect(blob).toBeInstanceOf(Blob);
      // Should draw non-political badge
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('非政治性報導'))).toBe(true);
    });

    it('handles empty points', async () => {
      const data = { ...baseData, points: [] };
      const blob = await renderArticleCard(data);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles null emotionIntensity', async () => {
      const data = { ...baseData, emotionIntensity: null };
      const blob = await renderArticleCard(data);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles null campRatio', async () => {
      const data = { ...baseData, campRatio: null };
      const blob = await renderArticleCard(data);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles extreme bias scores (0 and 100)', async () => {
      for (const score of [0, 100]) {
        mockCtx.fillText.mockClear();
        const data = { ...baseData, biasScore: score };
        const blob = await renderArticleCard(data);
        expect(blob).toBeInstanceOf(Blob);
      }
    });
  });

  describe('renderEventCard', () => {
    const baseData = {
      title: '測試事件標題',
      articleCount: 12,
      sourceCount: 5,
      campDistribution: { green: 40, white: 20, blue: 40 },
      blindspotType: null,
      analysisProgress: { analyzed: 8, total: 12 },
    };

    it('returns a Blob', async () => {
      const blob = await renderEventCard(baseData);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('draws article and source counts', async () => {
      await renderEventCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('12'))).toBe(true);
      expect(fillTextCalls.some(t => t.includes('篇報導'))).toBe(true);
      expect(fillTextCalls.some(t => t.includes('家媒體'))).toBe(true);
    });

    it('draws analysis progress', async () => {
      await renderEventCard(baseData);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('8/12'))).toBe(true);
    });

    it('draws blindspot warning when present', async () => {
      const data = { ...baseData, blindspotType: 'green_only' };
      await renderEventCard(data);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('僅泛綠報導'))).toBe(true);
    });

    it('handles null campDistribution', async () => {
      const data = { ...baseData, campDistribution: null };
      const blob = await renderEventCard(data);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('handles no blindspot', async () => {
      const blob = await renderEventCard(baseData);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('draws CTA when analysis progress is 0', async () => {
      const data = { ...baseData, analysisProgress: { analyzed: 0, total: 12 } };
      await renderEventCard(data);
      const fillTextCalls = mockCtx.fillText.mock.calls.map(c => c[0]);
      expect(fillTextCalls.some(t => t.includes('等待公民算力分析'))).toBe(true);
      expect(fillTextCalls.some(t => t.includes('幫助揭示'))).toBe(true);
      expect(fillTextCalls.some(t => t.includes('0/12'))).toBe(true);
      // Should NOT draw the normal progress label
      expect(fillTextCalls.some(t => t === '分析進度')).toBe(false);
    });
  });
});
