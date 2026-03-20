import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock the renderer and share modules
vi.mock('$lib/share/card-renderer.js', () => ({
  renderArticleCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  renderEventCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
}));

vi.mock('$lib/share/card-share.js', () => ({
  shareCard: vi.fn().mockResolvedValue({ method: 'download', success: true }),
}));

describe('ShareCardDialog', () => {
  const articleData = {
    title: '測試文章',
    source: '自由時報',
    biasScore: 50,
    isPolitical: true,
    campRatio: { green: 40, white: 20, blue: 40 },
    emotionIntensity: 50,
    points: ['重點一'],
  };

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('does not render when closed', () => {
    const { container } = render(ShareCardDialog, { props: { open: false, articleData } });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders dialog when open', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享分析卡片')).toBeTruthy();
    });
  });

  it('shows generating state initially', () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    expect(screen.getByText('生成中...')).toBeTruthy();
  });

  it('shows preview image after generation', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      const img = screen.getByAltText('分析卡片預覽');
      expect(img).toBeTruthy();
    });
  });

  it('has download button', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('下載圖片')).toBeTruthy();
    });
  });

  it('has share button', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享')).toBeTruthy();
    });
  });

  it('has close button that can be clicked', async () => {
    render(ShareCardDialog, { props: { open: true, articleData } });
    await vi.waitFor(() => {
      expect(screen.getByText('分享分析卡片')).toBeTruthy();
    });
    const closeBtn = screen.getByLabelText('關閉');
    expect(closeBtn).toBeTruthy();
    // Click should not throw (transition DOM removal depends on animate callback in jsdom)
    await fireEvent.click(closeBtn);
  });
});
