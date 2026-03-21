/**
 * Extended tests for article-detail.js
 *
 * Covers: renderArticle error handling, renderArticleContent (DOM),
 *         loadFeedbackSection, already analyzed articles,
 *         auto-runner banner, showReportDialog, showFeedbackMessage,
 *         document switching (cancel previous analysis),
 *         source name mapping, date formatting
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mod;
let mockFetchArticle, mockFetchArticleFeedbackStats, mockSubmitArticleFeedback;
let mockEnqueueAnalysis, mockCancelAnalysis, mockOnQueueChange, mockGetQueueStatus;
let mockRunPreAnalysisChecks, mockGetAutoRunnerStatus;
let mockIsAuthenticated, mockGetAuthToken;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();

  mockFetchArticle = vi.fn();
  mockFetchArticleFeedbackStats = vi.fn(() => Promise.resolve({
    success: true,
    data: { likes: 5, dislikes: 1, user_feedback: null },
  }));
  mockSubmitArticleFeedback = vi.fn(() => Promise.resolve({ success: true, data: {} }));
  mockEnqueueAnalysis = vi.fn(() => new Promise(() => {}));
  mockCancelAnalysis = vi.fn();
  mockOnQueueChange = vi.fn(() => () => {});
  mockGetQueueStatus = vi.fn(() => ({ currentJob: null, pending: [] }));
  mockRunPreAnalysisChecks = vi.fn(() => Promise.resolve({ canAnalyze: true, issues: [] }));
  mockGetAutoRunnerStatus = vi.fn(() => ({ running: false }));
  mockIsAuthenticated = vi.fn(() => false);
  mockGetAuthToken = vi.fn(() => null);

  vi.doMock('../../src/lib/core/api.js', () => ({
    fetchArticle: mockFetchArticle,
    fetchArticleFeedbackStats: mockFetchArticleFeedbackStats,
    submitArticleFeedback: mockSubmitArticleFeedback,
    reportArticle: vi.fn(() => Promise.resolve({ success: true, data: {} })),
  }));
  vi.doMock('../../src/lib/core/auth.js', () => ({
    getAuthToken: mockGetAuthToken,
    isAuthenticated: mockIsAuthenticated,
  }));
  vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({
    t: vi.fn((key) => key),
  }));
  vi.doMock('../../src/lib/components/camp-bar.js', () => ({
    createCampBar: vi.fn(() => document.createElement('div')),
  }));
  vi.doMock('../../src/lib/core/queue.js', () => ({
    enqueueAnalysis: mockEnqueueAnalysis,
    cancelAnalysis: mockCancelAnalysis,
    onQueueChange: mockOnQueueChange,
    getQueueStatus: mockGetQueueStatus,
    AnalysisCancelledError: class extends Error {},
  }));
  vi.doMock('../../src/lib/pages/analyze-result.js', () => ({
    renderResultPreview: vi.fn(),
  }));
  vi.doMock('../../src/lib/pages/analyze-checks.js', () => ({
    runPreAnalysisChecks: mockRunPreAnalysisChecks,
  }));
  vi.doMock('../../src/lib/pages/analyze-engine.js', () => ({
    updateStatusUI: vi.fn(),
  }));
  vi.doMock('../../src/lib/pages/article-panels.js', () => ({
    loadClusterPanel: vi.fn(),
  }));
  vi.doMock('../../src/lib/core/auto-runner.js', () => ({
    getAutoRunnerStatus: mockGetAutoRunnerStatus,
  }));
  vi.doMock('../../src/lib/core/benchmark.js', () => ({
    scanGPU: vi.fn(() => Promise.resolve({ supported: true })),
    getUserGPUSelection: vi.fn(() => null),
    saveUserGPUSelection: vi.fn(),
  }));
  vi.doMock('../../src/lib/core/gpu-database.js', () => ({
    getGPUOptionsForArch: vi.fn(() => null),
  }));
  vi.doMock('../../src/lib/pages/settings-helpers.js', () => ({
    formatVRAM: vi.fn((mb) => `${mb} MB`),
  }));
  vi.doMock('../../src/lib/utils/device-detect.js', () => ({
    isMobileDevice: vi.fn(() => false),
  }));

  mod = await import('../../src/lib/pages/article-detail.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  // Clean up any dialogs added to body
  document.body.querySelectorAll('.report-overlay').forEach(el => el.remove());
});

const makeArticle = (overrides = {}) => ({
  article_id: 'art-1',
  title: 'Test Article',
  source: 'cna',
  published_at: '2026-03-10T00:00:00Z',
  summary: 'Test summary content',
  primary_url: 'https://example.com/article',
  ...overrides,
});

// ══════════════════════════════════════════════
// 1. renderArticle — error state
// ══════════════════════════════════════════════

describe('renderArticle — error handling', () => {
  it('shows error when fetchArticle fails', async () => {
    mockFetchArticle.mockResolvedValue({
      success: false,
      data: null,
      error: { message: '找不到文章' },
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'not-found' });

    const error = container.querySelector('.error-state');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('找不到文章');
  });

  it('shows generic error message when no message in error', async () => {
    mockFetchArticle.mockResolvedValue({
      success: false,
      data: null,
      error: {},
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'err' });

    const error = container.querySelector('.error-state');
    expect(error).not.toBeNull();
    // Should show fallback message
    expect(error.textContent).toContain('系統錯誤');
  });

  it('has a back button in error state', async () => {
    mockFetchArticle.mockResolvedValue({
      success: false,
      data: null,
      error: { message: 'Error' },
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'err' });

    const backBtn = container.querySelector('.btn--text');
    expect(backBtn).not.toBeNull();
    expect(backBtn.textContent).toBe('返回');
  });
});

// ══════════════════════════════════════════════
// 2. renderArticleContent — DOM structure
// ══════════════════════════════════════════════

describe('renderArticleContent — DOM structure', () => {
  it('renders title, source, date, and summary', async () => {
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    expect(container.querySelector('.article-detail__title').textContent).toBe('Test Article');
    expect(container.querySelector('.article-card__source').textContent).toBe('中央社');
    expect(container.querySelector('.article-detail__summary')).not.toBeNull();
  });

  it('renders "前往原文" link when article has URL', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ url: 'https://example.com' }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const link = container.querySelector('.btn--primary[target="_blank"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toBe('前往原文');
    expect(link.href).toBe('https://example.com/');
  });

  it('does not render link when no URL', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ primary_url: undefined, url: undefined }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const link = container.querySelector('.article-detail__actions');
    expect(link).toBeNull();
  });

  it('renders camp bar when camp_ratio exists', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ camp_ratio: { green: 40, blue: 30, white: 20, gray: 10 } }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    expect(container.querySelector('.article-detail__camp')).not.toBeNull();
  });

  it('renders camp bar from JSON string camp_ratio', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ camp_ratio: JSON.stringify({ green: 50, blue: 50, white: 0, gray: 0 }) }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    expect(container.querySelector('.article-detail__camp')).not.toBeNull();
  });

  it('does not render summary section when no summary', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ summary: undefined }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    expect(container.querySelector('.article-detail__summary')).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 3. Already analyzed article
// ══════════════════════════════════════════════

describe('already analyzed article', () => {
  it('shows "已被分析過" message when analysis_count > 0', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ analysis_count: 1 }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const msg = container.querySelector('.analyze-trigger__desc');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain('已被分析過');
  });
});

// ══════════════════════════════════════════════
// 4. Auto-runner banner
// ══════════════════════════════════════════════

describe('auto-runner active banner', () => {
  it('shows auto-runner info when runner is active', async () => {
    mockGetAutoRunnerStatus.mockReturnValue({ running: true });
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const banner = container.querySelector('.auto-runner-article-info');
    expect(banner).not.toBeNull();
    expect(banner.querySelector('.auto-runner-article-info__text').textContent).toContain('自動分析進行中');
  });

  it('has manual override button in auto-runner banner', async () => {
    mockGetAutoRunnerStatus.mockReturnValue({ running: true });
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const overrideBtn = container.querySelector('.auto-runner-article-info .btn--secondary');
    expect(overrideBtn).not.toBeNull();
    expect(overrideBtn.textContent).toContain('手動分析');
  });
});

// ══════════════════════════════════════════════
// 5. Document switching (cancel previous)
// ══════════════════════════════════════════════

describe('document switching', () => {
  it('cancels previous analysis when switching articles', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ article_id: 'art-A' }),
    });

    const container = document.createElement('div');

    // Render first article
    await mod.renderArticle(container, { hash: 'art-A' });

    // Render second article — should cancel first
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ article_id: 'art-B' }),
    });
    await mod.renderArticle(container, { hash: 'art-B' });

    expect(mockCancelAnalysis).toHaveBeenCalledWith('art-A');
  });

  it('does not cancel when rendering same article', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle({ article_id: 'art-same' }),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-same' });
    await mod.renderArticle(container, { hash: 'art-same' });

    // cancelAnalysis should not have been called with 'art-same'
    // (it's the same article, not a switch)
    expect(mockCancelAnalysis).not.toHaveBeenCalledWith('art-same');
  });
});

// ══════════════════════════════════════════════
// 6. Feedback section
// ══════════════════════════════════════════════

describe('loadFeedbackSection', () => {
  it('renders like/dislike buttons with counts', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    // Wait for async feedback stats load
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    const dislikeBtn = container.querySelector('.feedback-btn--dislike');
    expect(likeBtn).not.toBeNull();
    expect(dislikeBtn).not.toBeNull();

    const likeCount = likeBtn.querySelector('.feedback-btn__count');
    expect(likeCount.textContent).toBe('5');
  });

  it('disables buttons when user already voted', async () => {
    mockFetchArticleFeedbackStats.mockResolvedValue({
      success: true,
      data: { likes: 10, dislikes: 2, user_feedback: 'like' },
    });
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    expect(likeBtn.disabled).toBe(true);
    expect(likeBtn.classList.contains('feedback-btn--active')).toBe(true);
  });

  it('renders report button', async () => {
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    expect(reportBtn).not.toBeNull();
  });
});

// ══════════════════════════════════════════════
// 7. showReportDialog
// ══════════════════════════════════════════════

describe('showReportDialog', () => {
  it('shows login warning when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    // Should show warning message, NOT dialog
    const msg = container.querySelector('.feedback-bar__message');
    expect(msg).not.toBeNull();
    expect(msg.hidden).toBe(false);
  });

  it('opens dialog overlay when authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('tok');
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.body.querySelector('.report-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('role')).toBe('dialog');

    const reasons = overlay.querySelectorAll('input[name="report-reason"]');
    expect(reasons.length).toBe(5);
  });
});

// ══════════════════════════════════════════════
// 8. showFeedbackMessage
// ══════════════════════════════════════════════

describe('showFeedbackMessage', () => {
  it('is exported and callable', () => {
    expect(typeof mod.showFeedbackMessage).toBe('function');
  });

  it('shows and auto-hides message', () => {
    vi.useFakeTimers();
    const el = document.createElement('p');
    el.hidden = true;

    mod.showFeedbackMessage(el, 'Test msg', 'success');

    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Test msg');
    expect(el.className).toContain('feedback-bar__message--success');

    vi.advanceTimersByTime(3000);
    expect(el.hidden).toBe(true);

    vi.useRealTimers();
  });
});

// ══════════════════════════════════════════════
// 9. Source name mapping
// ══════════════════════════════════════════════

describe('source name mapping', () => {
  const sources = [
    ['cna', '中央社'],
    ['liberty_times', '自由時報'],
    ['china_times', '中國時報'],
    ['unknown_source', 'unknown_source'], // fallback to key
  ];

  for (const [key, expected] of sources) {
    it(`maps "${key}" to "${expected}"`, async () => {
      mockFetchArticle.mockResolvedValue({
        success: true,
        data: makeArticle({ source: key }),
      });

      const container = document.createElement('div');
      await mod.renderArticle(container, { hash: 'art-1' });

      const sourceBadge = container.querySelector('.article-card__source');
      expect(sourceBadge.textContent).toBe(expected);
    });
  }
});

// ══════════════════════════════════════════════
// 10. Analysis checks blocked
// ══════════════════════════════════════════════

describe('analysis blocked by pre-checks', () => {
  it('shows blocked issues when canAnalyze is false', async () => {
    mockRunPreAnalysisChecks.mockResolvedValue({
      canAnalyze: false,
      issues: [
        { type: 'auth', message: '請先登入' },
        { type: 'limit', message: '已達分析上限' },
      ],
    });
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      await new Promise(r => setTimeout(r, 50));
    }

    const blockedItems = container.querySelectorAll('.analyze-blocked__item');
    expect(blockedItems.length).toBe(2);
    expect(blockedItems[0].querySelector('p').textContent).toBe('請先登入');
  });

  it('shows login button for auth-type issue', async () => {
    mockRunPreAnalysisChecks.mockResolvedValue({
      canAnalyze: false,
      issues: [{ type: 'auth', message: 'Login needed' }],
    });
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      await new Promise(r => setTimeout(r, 50));
    }

    const loginBtn = container.querySelector('.analyze-blocked__item--auth .btn--primary');
    expect(loginBtn).not.toBeNull();
    expect(loginBtn.textContent).toContain('Google');
  });
});

// ══════════════════════════════════════════════
// 11. Queue position tracking
// ══════════════════════════════════════════════

describe('queue position tracking', () => {
  it('shows "排隊等待中" when article is in queue', async () => {
    mockGetQueueStatus.mockReturnValue({
      currentJob: null,
      pending: ['art-1'],
    });
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: makeArticle(),
    });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    // Article is in queue, should show waiting status
    const msg = container.querySelector('.analyze-status__message');
    expect(msg).not.toBeNull();
  });
});
