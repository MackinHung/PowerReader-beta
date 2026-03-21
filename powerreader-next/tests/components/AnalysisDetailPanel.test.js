/**
 * Unit tests for AnalysisDetailPanel.svelte
 *
 * Tests cover: open/close rendering, mobile/desktop layouts, article data display,
 * political/non-political badges, conditional sections, Escape key, close/open-original actions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AnalysisDetailPanel from '$lib/components/analysis/AnalysisDetailPanel.svelte';

// Polyfill Element.animate for Svelte transitions in jsdom
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { onfinish: null, cancel: () => {}, finished: Promise.resolve() };
  };
}

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'analysis.not_political': '非政治類文章',
    };
    return map[key] || key;
  })
}));

// Mock mediaQuery store
let mockIsMobile = false;
vi.mock('$lib/stores/mediaQuery.svelte.js', () => ({
  getMediaQueryStore: () => ({
    get isMobile() { return mockIsMobile; },
    get isTablet() { return false; },
    get isDesktop() { return !mockIsMobile; },
    sidebarExpanded: true,
    sidebarMode: 'expanded',
    toggleSidebar: vi.fn(),
  }),
}));

// Mock ShareCardButton's deep dependencies (card-renderer, card-share) to avoid Canvas issues
// Polyfill URL.createObjectURL/revokeObjectURL for jsdom
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

vi.mock('$lib/share/card-renderer.js', () => ({
  renderArticleCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  renderEventCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
}));

vi.mock('$lib/share/card-share.js', () => ({
  shareCard: vi.fn().mockResolvedValue({ method: 'download', success: true }),
}));

describe('AnalysisDetailPanel', () => {
  const fullArticle = {
    title: '測試文章標題',
    source: '自由時報',
    primary_url: 'https://example.com/article',
    is_political: true,
    bias_score: 1.5,
    camp_ratio: { green: 40, white: 20, blue: 40 },
    emotion_intensity: 65,
    knowledge_items: [{ id: 'k1', type: 'politician', title: 'Test', content: 'content' }],
    points: ['重點一', '重點二'],
  };

  const nonPoliticalArticle = {
    title: '科技新聞',
    source: 'TechNews',
    primary_url: 'https://example.com/tech',
    is_political: false,
    bias_score: null,
    camp_ratio: null,
    emotion_intensity: 30,
  };

  let windowOpenSpy;

  beforeEach(() => {
    mockIsMobile = false;
    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Open / Close ──

  it('does not render when open=false', () => {
    const { container } = render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: false }
    });
    expect(container.querySelector('.panel-desktop')).toBeNull();
    expect(container.querySelector('.panel-mobile')).toBeNull();
    expect(container.querySelector('.panel-backdrop')).toBeNull();
  });

  it('does not render when article is null', () => {
    const { container } = render(AnalysisDetailPanel, {
      props: { article: null, open: true }
    });
    expect(container.querySelector('.panel-desktop')).toBeNull();
  });

  it('renders desktop panel when open with article on desktop', () => {
    mockIsMobile = false;
    const { container } = render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(container.querySelector('.panel-desktop')).toBeTruthy();
    expect(container.querySelector('.panel-backdrop')).toBeTruthy();
  });

  it('renders mobile panel when on mobile', () => {
    mockIsMobile = true;
    const { container } = render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(container.querySelector('.panel-mobile')).toBeTruthy();
    expect(container.querySelector('.panel-desktop')).toBeNull();
  });

  // ── Content display ──

  it('displays article title', () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(screen.getByText('測試文章標題')).toBeTruthy();
  });

  it('displays source attribution', () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(screen.getByText(/自由時報/)).toBeTruthy();
  });

  it('displays bias spectrum section label for political articles', () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(screen.getByText('立場偏向')).toBeTruthy();
  });

  it('displays camp ratio section label for political articles', () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(screen.getByText('陣營比例')).toBeTruthy();
  });

  // ── Non-political badge ──

  it('shows not-political badge for non-political articles', () => {
    render(AnalysisDetailPanel, {
      props: { article: nonPoliticalArticle, open: true }
    });
    expect(screen.getByText('非政治類文章')).toBeTruthy();
  });

  it('hides not-political badge for political articles', () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(screen.queryByText('非政治類文章')).toBeNull();
  });

  // ── Conditional sections ──

  it('hides bias spectrum when bias_score is null', () => {
    const article = { ...fullArticle, bias_score: null };
    render(AnalysisDetailPanel, {
      props: { article, open: true }
    });
    expect(screen.queryByText('立場偏向')).toBeNull();
  });

  it('hides camp ratio when camp_ratio is null', () => {
    const article = { ...fullArticle, camp_ratio: null };
    render(AnalysisDetailPanel, {
      props: { article, open: true }
    });
    expect(screen.queryByText('陣營比例')).toBeNull();
  });

  it('hides source attribution when source is empty', () => {
    const article = { ...fullArticle, source: '' };
    const { container } = render(AnalysisDetailPanel, {
      props: { article, open: true }
    });
    expect(container.querySelector('.source-attribution')).toBeNull();
  });

  // ── Close actions ──

  it('calls onclose when close button clicked (desktop)', async () => {
    mockIsMobile = false;
    const onclose = vi.fn();
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true, onclose }
    });
    const closeBtn = screen.getByLabelText('關閉');
    await fireEvent.click(closeBtn);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('calls onclose when backdrop clicked', async () => {
    mockIsMobile = false;
    const onclose = vi.fn();
    const { container } = render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true, onclose }
    });
    const backdrop = container.querySelector('.panel-backdrop');
    await fireEvent.click(backdrop);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('calls onclose on Escape key', async () => {
    const onclose = vi.fn();
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true, onclose }
    });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('does not call onclose on Escape when closed', async () => {
    const onclose = vi.fn();
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: false, onclose }
    });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();
  });

  // ── Open original ──

  it('opens original article URL in new tab', async () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    const openBtn = screen.getByLabelText('查看原文');
    await fireEvent.click(openBtn);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://example.com/article', '_blank', 'noopener'
    );
  });

  it('does not open window when primary_url is missing', async () => {
    const article = { ...fullArticle, primary_url: '' };
    render(AnalysisDetailPanel, {
      props: { article, open: true }
    });
    const openBtn = screen.getByLabelText('查看原文');
    await fireEvent.click(openBtn);
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  // ── Panel header ──

  it('shows panel title text', () => {
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true }
    });
    expect(screen.getByText('分析詳情')).toBeTruthy();
  });

  // ── Article with empty title ──

  it('renders empty title gracefully', () => {
    const article = { ...fullArticle, title: '' };
    const { container } = render(AnalysisDetailPanel, {
      props: { article, open: true }
    });
    const titleEl = container.querySelector('.article-title');
    expect(titleEl).toBeTruthy();
    expect(titleEl.textContent).toBe('');
  });

  // ── Mobile-specific close button ──

  it('has close button on mobile panel', async () => {
    mockIsMobile = true;
    const onclose = vi.fn();
    render(AnalysisDetailPanel, {
      props: { article: fullArticle, open: true, onclose }
    });
    const closeBtn = screen.getByLabelText('關閉');
    await fireEvent.click(closeBtn);
    expect(onclose).toHaveBeenCalledTimes(1);
  });
});
