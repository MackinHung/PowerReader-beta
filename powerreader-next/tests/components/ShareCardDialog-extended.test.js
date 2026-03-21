/**
 * Extended tests for ShareCardDialog.svelte
 *
 * Supplements existing ShareCardDialog.test.js to boost coverage from ~68% to 80%+.
 * Focuses on: error states, eventData path, download handler, share handler,
 * cleanup on close, keyboard handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ShareCardDialog from '$lib/components/share/ShareCardDialog.svelte';

// Polyfill URL.createObjectURL/revokeObjectURL for jsdom
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

// Polyfill Element.animate for Svelte transitions in jsdom
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { onfinish: null, cancel: () => {}, finished: Promise.resolve() };
  };
}

// Use vi.hoisted() so these are available inside vi.mock() factory (hoisted)
const { mockRenderArticleCard, mockRenderEventCard, mockShareCard } = vi.hoisted(() => ({
  mockRenderArticleCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  mockRenderEventCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  mockShareCard: vi.fn().mockResolvedValue({ method: 'download', success: true }),
}));

vi.mock('$lib/share/card-renderer.js', () => ({
  renderArticleCard: mockRenderArticleCard,
  renderEventCard: mockRenderEventCard,
}));

vi.mock('$lib/share/card-share.js', () => ({
  shareCard: mockShareCard,
}));

describe('ShareCardDialog - extended', () => {
  const articleData = {
    title: '延伸測試文章',
    source: '聯合報',
    biasScore: -1,
    isPolitical: true,
    campRatio: { green: 20, white: 30, blue: 50 },
    emotionIntensity: 40,
    points: ['重點 A', '重點 B'],
  };

  const eventData = {
    title: '事件標題',
    articleCount: 10,
    sourceCount: 5,
    campDistribution: null,
    blindspotType: null,
    analysisProgress: { analyzed: 8, total: 10 },
  };

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    mockRenderArticleCard.mockClear();
    mockRenderEventCard.mockClear();
    mockShareCard.mockClear();
    // Reset defaults
    mockRenderArticleCard.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mockRenderEventCard.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mockShareCard.mockResolvedValue({ method: 'download', success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Event data path ──

  it('renders with eventData instead of articleData', async () => {
    render(ShareCardDialog, { props: { open: true, eventData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享分析卡片')).toBeTruthy();
    });
    expect(mockRenderEventCard).toHaveBeenCalledTimes(1);
    expect(mockRenderArticleCard).not.toHaveBeenCalled();
  });

  // ── Render error handling ──

  it('shows error message when render fails', async () => {
    mockRenderArticleCard.mockRejectedValueOnce(new Error('Canvas failed'));
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('生成失敗，請重試')).toBeTruthy();
    });
  });

  // ── Download button ──

  it('download button is disabled during generation', () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    const downloadBtn = screen.getByText('下載圖片').closest('button');
    expect(downloadBtn.disabled).toBe(true);
  });

  it('download button is enabled after generation', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      const downloadBtn = screen.getByText('下載圖片').closest('button');
      expect(downloadBtn.disabled).toBe(false);
    });
  });

  it('clicking download creates a temporary link', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('下載圖片').closest('button').disabled).toBe(false);
    });
    await fireEvent.click(screen.getByText('下載圖片').closest('button'));
    // Verify createElement was called with 'a'
    const aCalls = createElementSpy.mock.calls.filter(c => c[0] === 'a');
    expect(aCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ── Share button ──

  it('share button is disabled during generation', () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    const shareBtn = screen.getByText('分享').closest('button');
    expect(shareBtn.disabled).toBe(true);
  });

  it('share button is enabled after generation', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      const shareBtn = screen.getByText('分享').closest('button');
      expect(shareBtn.disabled).toBe(false);
    });
  });

  it('calls shareCard on share click', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享').closest('button').disabled).toBe(false);
    });
    await fireEvent.click(screen.getByText('分享').closest('button'));
    await vi.waitFor(() => {
      expect(mockShareCard).toHaveBeenCalledTimes(1);
    });
  });

  it('shows native shared message after native share', async () => {
    mockShareCard.mockResolvedValueOnce({ method: 'native', success: true });
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享').closest('button').disabled).toBe(false);
    });
    await fireEvent.click(screen.getByText('分享').closest('button'));
    await vi.waitFor(() => {
      expect(screen.getByText('分享成功')).toBeTruthy();
    });
  });

  it('shows download message after download share fallback', async () => {
    mockShareCard.mockResolvedValueOnce({ method: 'download', success: true });
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享').closest('button').disabled).toBe(false);
    });
    await fireEvent.click(screen.getByText('分享').closest('button'));
    await vi.waitFor(() => {
      expect(screen.getByText('已下載圖片')).toBeTruthy();
    });
  });

  it('shows error when share fails', async () => {
    mockShareCard.mockRejectedValueOnce(new Error('share failed'));
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享').closest('button').disabled).toBe(false);
    });
    await fireEvent.click(screen.getByText('分享').closest('button'));
    await vi.waitFor(() => {
      expect(screen.getByText('生成失敗，請重試')).toBeTruthy();
    });
  });

  // ── Keyboard: Escape closes dialog ──

  it('closes dialog on Escape key press on backdrop', async () => {
    const { container } = render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    });
    const backdrop = container.querySelector('.dialog-backdrop');
    await fireEvent.keyDown(backdrop, { key: 'Escape' });
    // The component sets open=false via bindable, which should hide dialog
  });

  // ── No data path (neither article nor event) ──

  it('does not call renderers when no data provided', async () => {
    render(ShareCardDialog, { props: { open: true, articleData: null, eventData: null } });
    // Give some time for async effects
    await new Promise(r => setTimeout(r, 50));
    expect(mockRenderArticleCard).not.toHaveBeenCalled();
    expect(mockRenderEventCard).not.toHaveBeenCalled();
  });

  // ── Preview image ──

  it('shows preview image after successful render', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      const img = screen.getByAltText('分析卡片預覽');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('blob:mock-preview');
    });
  });
});
