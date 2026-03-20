import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ShareCardButton from '$lib/components/share/ShareCardButton.svelte';

// Polyfill URL.createObjectURL/revokeObjectURL for jsdom
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

// Polyfill Element.animate for Svelte transitions in jsdom
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { onfinish: null, cancel: () => {}, finished: Promise.resolve() };
  };
}

// Mock the renderer to avoid canvas issues
vi.mock('$lib/share/card-renderer.js', () => ({
  renderArticleCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  renderEventCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
}));

vi.mock('$lib/share/card-share.js', () => ({
  shareCard: vi.fn().mockResolvedValue({ method: 'download', success: true }),
}));

describe('ShareCardButton', () => {
  const articleData = {
    title: '測試文章',
    source: '自由時報',
    biasScore: 50,
    isPolitical: true,
    campRatio: { green: 40, white: 20, blue: 40 },
    emotionIntensity: 50,
    points: ['重點一'],
  };

  it('renders icon variant by default', () => {
    render(ShareCardButton, { props: { articleData } });
    const btn = screen.getByLabelText('分享分析卡片');
    expect(btn).toBeTruthy();
    expect(btn.querySelector('.material-symbols-outlined')?.textContent).toBe('share');
  });

  it('renders text variant', () => {
    render(ShareCardButton, { props: { articleData, variant: 'text' } });
    expect(screen.getByText('分享分析卡片')).toBeTruthy();
  });

  it('opens dialog on click', async () => {
    render(ShareCardButton, { props: { articleData } });
    const btn = screen.getByLabelText('分享分析卡片');
    await fireEvent.click(btn);
    // Dialog should appear
    await vi.waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
    });
  });

  it('accepts eventData prop', () => {
    const eventData = {
      title: '事件標題',
      articleCount: 5,
      sourceCount: 3,
      campDistribution: null,
      blindspotType: null,
      analysisProgress: { analyzed: 3, total: 5 },
    };
    render(ShareCardButton, { props: { eventData } });
    expect(screen.getByLabelText('分享分析卡片')).toBeTruthy();
  });
});
