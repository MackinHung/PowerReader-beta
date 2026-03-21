/**
 * Branch coverage tests for article-detail.js
 *
 * Targets uncovered branches, functions, and edge cases:
 * - handleFeedbackClick (lines 664-707)
 * - renderAnalysisError (lines 547-566)
 * - _renderInlineGPUPicker (lines 464-496)
 * - enqueueAndTrack callbacks (onStatus, then, catch)
 * - Report dialog submit handler (lines 770-790)
 * - formatDate edge cases, _unsubscribeQueue cleanup,
 *   renderWaitingStatus with position, GPU userOverride path,
 *   dislike user_feedback branch, auto-runner override click
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mock references
let mod;
let mockFetchArticle, mockFetchArticleFeedbackStats, mockSubmitArticleFeedback, mockReportArticle;
let mockEnqueueAnalysis, mockCancelAnalysis, mockOnQueueChange, mockGetQueueStatus;
let mockRunPreAnalysisChecks, mockGetAutoRunnerStatus;
let mockIsAuthenticated, mockGetAuthToken;
let mockScanGPU, mockGetUserGPUSelection, mockSaveUserGPUSelection;
let mockGetGPUOptionsForArch;
let mockUpdateStatusUI, mockRenderResultPreview;
let mockIsMobileDevice;
let MockAnalysisCancelledError;

function setupMocks() {
  mockFetchArticle = vi.fn();
  mockFetchArticleFeedbackStats = vi.fn(() => Promise.resolve({
    success: true,
    data: { likes: 5, dislikes: 1, user_feedback: null },
  }));
  mockSubmitArticleFeedback = vi.fn(() => Promise.resolve({ success: true, data: {} }));
  mockReportArticle = vi.fn(() => Promise.resolve({ success: true, data: {} }));
  mockEnqueueAnalysis = vi.fn(() => new Promise(() => {}));
  mockCancelAnalysis = vi.fn();
  mockOnQueueChange = vi.fn(() => () => {});
  mockGetQueueStatus = vi.fn(() => ({ currentJob: null, pending: [] }));
  mockRunPreAnalysisChecks = vi.fn(() => Promise.resolve({ canAnalyze: true, issues: [] }));
  mockGetAutoRunnerStatus = vi.fn(() => ({ running: false }));
  mockIsAuthenticated = vi.fn(() => false);
  mockGetAuthToken = vi.fn(() => null);
  mockScanGPU = vi.fn(() => Promise.resolve({
    supported: true, vendor: 'nvidia', architecture: 'ada',
    device: 'RTX 4070', vramMB: 12288, gpuType: 'discrete', archInfo: null,
  }));
  mockGetUserGPUSelection = vi.fn(() => null);
  mockSaveUserGPUSelection = vi.fn();
  mockGetGPUOptionsForArch = vi.fn(() => null);
  mockUpdateStatusUI = vi.fn();
  mockRenderResultPreview = vi.fn();
  mockIsMobileDevice = vi.fn(() => false);
  MockAnalysisCancelledError = class extends Error {};
}

function registerMocks() {
  vi.doMock('../../src/lib/core/api.js', () => ({
    fetchArticle: mockFetchArticle,
    fetchArticleFeedbackStats: mockFetchArticleFeedbackStats,
    submitArticleFeedback: mockSubmitArticleFeedback,
    reportArticle: mockReportArticle,
    reportAnalysis: vi.fn(() => Promise.resolve({ success: true, data: {} })),
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
    AnalysisCancelledError: MockAnalysisCancelledError,
  }));
  vi.doMock('../../src/lib/pages/analyze-result.js', () => ({
    renderResultPreview: mockRenderResultPreview,
  }));
  vi.doMock('../../src/lib/pages/analyze-checks.js', () => ({
    runPreAnalysisChecks: mockRunPreAnalysisChecks,
  }));
  vi.doMock('../../src/lib/pages/analyze-engine.js', () => ({
    updateStatusUI: mockUpdateStatusUI,
  }));
  vi.doMock('../../src/lib/pages/article-panels.js', () => ({
    loadClusterPanel: vi.fn(),
  }));
  vi.doMock('../../src/lib/core/auto-runner.js', () => ({
    getAutoRunnerStatus: mockGetAutoRunnerStatus,
  }));
  vi.doMock('../../src/lib/core/benchmark.js', () => ({
    scanGPU: mockScanGPU,
    getUserGPUSelection: mockGetUserGPUSelection,
    saveUserGPUSelection: mockSaveUserGPUSelection,
  }));
  vi.doMock('../../src/lib/core/gpu-database.js', () => ({
    getGPUOptionsForArch: mockGetGPUOptionsForArch,
  }));
  vi.doMock('../../src/lib/pages/settings-helpers.js', () => ({
    formatVRAM: vi.fn((mb) => `${mb} MB`),
  }));
  vi.doMock('../../src/lib/utils/device-detect.js', () => ({
    isMobileDevice: mockIsMobileDevice,
  }));
}

const makeArticle = (overrides = {}) => ({
  article_id: 'art-1',
  title: 'Test Article',
  source: 'cna',
  published_at: '2026-03-10T00:00:00Z',
  summary: 'Test summary content',
  primary_url: 'https://example.com/article',
  ...overrides,
});

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  setupMocks();
  registerMocks();
  mod = await import('../../src/lib/pages/article-detail.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.querySelectorAll('.report-overlay').forEach(el => el.remove());
});

// ══════════════════════════════════════════════
// 1. handleFeedbackClick
// ══════════════════════════════════════════════

describe('handleFeedbackClick', () => {
  it('shows login required warning when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    likeBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const msg = container.querySelector('.feedback-bar__message');
    expect(msg).not.toBeNull();
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toBe('feedback.login_required');
  });

  it('submits feedback successfully and updates counts', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('test-token');
    mockSubmitArticleFeedback.mockResolvedValue({ success: true, data: {} });
    // After submit, re-fetch stats returns updated counts
    mockFetchArticleFeedbackStats
      .mockResolvedValueOnce({ success: true, data: { likes: 5, dislikes: 1, user_feedback: null } })
      .mockResolvedValueOnce({ success: true, data: { likes: 6, dislikes: 1, user_feedback: 'like' } });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    likeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    expect(mockSubmitArticleFeedback).toHaveBeenCalledWith('art-1', 'like', 'test-token');
    const likeCount = container.querySelector('.feedback-btn--like .feedback-btn__count');
    expect(likeCount.textContent).toBe('6');
    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('feedback.submit_success');
  });

  it('handles dislike feedback and marks dislike button active', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('test-token');
    mockSubmitArticleFeedback.mockResolvedValue({ success: true, data: {} });
    mockFetchArticleFeedbackStats
      .mockResolvedValueOnce({ success: true, data: { likes: 5, dislikes: 1, user_feedback: null } })
      .mockResolvedValueOnce({ success: true, data: { likes: 5, dislikes: 2, user_feedback: 'dislike' } });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const dislikeBtn = container.querySelector('.feedback-btn--dislike');
    dislikeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    expect(mockSubmitArticleFeedback).toHaveBeenCalledWith('art-1', 'dislike', 'test-token');
    const dislikeCount = container.querySelector('.feedback-btn--dislike .feedback-btn__count');
    expect(dislikeCount.textContent).toBe('2');
    expect(dislikeBtn.classList.contains('feedback-btn--active')).toBe(true);
  });

  it('shows already_submitted warning on duplicate feedback', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('test-token');
    mockSubmitArticleFeedback.mockResolvedValue({
      success: false, error: { type: 'already_submitted' },
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    likeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('feedback.already_submitted');
  });

  it('shows error and re-enables buttons on submit failure', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('test-token');
    mockSubmitArticleFeedback.mockResolvedValue({
      success: false, error: { message: 'Server error' },
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    const dislikeBtn = container.querySelector('.feedback-btn--dislike');
    likeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    // Buttons should be re-enabled on error
    expect(likeBtn.disabled).toBe(false);
    expect(dislikeBtn.disabled).toBe(false);
    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('Server error');
  });

  it('shows generic error when no error message on failure', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('test-token');
    mockSubmitArticleFeedback.mockResolvedValue({
      success: false, error: {},
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const likeBtn = container.querySelector('.feedback-btn--like');
    likeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('feedback.submit_error');
  });
});

// ══════════════════════════════════════════════
// 2. dislike user_feedback branch in initial load
// ══════════════════════════════════════════════

describe('feedback initial state — dislike active', () => {
  it('marks dislike button active when user_feedback is dislike', async () => {
    mockFetchArticleFeedbackStats.mockResolvedValue({
      success: true,
      data: { likes: 3, dislikes: 7, user_feedback: 'dislike' },
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const dislikeBtn = container.querySelector('.feedback-btn--dislike');
    expect(dislikeBtn.disabled).toBe(true);
    expect(dislikeBtn.classList.contains('feedback-btn--active')).toBe(true);

    const likeBtn = container.querySelector('.feedback-btn--like');
    expect(likeBtn.disabled).toBe(true);
    expect(likeBtn.classList.contains('feedback-btn--active')).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 3. enqueueAndTrack — analysis success (then callback)
// ══════════════════════════════════════════════

describe('enqueueAndTrack — analysis completion', () => {
  it('renders result preview on successful analysis', async () => {
    const analysisResult = { bias_score: 0.7 };
    mockEnqueueAnalysis.mockResolvedValue(analysisResult);
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    // Click analyze button
    const analyzeBtn = container.querySelector('.btn--large');
    expect(analyzeBtn).not.toBeNull();
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    expect(mockRenderResultPreview).toHaveBeenCalled();
    const callArgs = mockRenderResultPreview.mock.calls[0];
    expect(callArgs[2]).toHaveProperty('analysis_duration_ms');
  });

  it('renders analysis error on enqueue rejection', async () => {
    mockEnqueueAnalysis.mockRejectedValue(new Error('GPU out of memory'));
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const section = container.querySelector('#analysis-section');
    const errMsg = section.querySelector('.error-state');
    expect(errMsg).not.toBeNull();
    expect(errMsg.textContent).toContain('分析失敗');

    const errDetail = section.querySelector('.analyze-status__elapsed');
    expect(errDetail).not.toBeNull();
    expect(errDetail.textContent).toBe('GPU out of memory');

    const retryBtn = section.querySelector('.btn--primary');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn.textContent).toBe('重試');
  });

  it('silently ignores AnalysisCancelledError', async () => {
    mockEnqueueAnalysis.mockRejectedValue(new MockAnalysisCancelledError('cancelled'));
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    // Should NOT show error state
    const errMsg = container.querySelector('.error-state');
    expect(errMsg).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 4. enqueueAndTrack — onStatus callback
// ══════════════════════════════════════════════

describe('enqueueAndTrack — onStatus callback', () => {
  it('calls updateStatusUI when onStatus fires', async () => {
    // Make enqueueAnalysis call the onStatus callback before resolving
    mockEnqueueAnalysis.mockImplementation((id, article, opts) => {
      opts.onStatus('loading', 1000, { progress: 50 });
      return new Promise(() => {}); // hang
    });
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    expect(mockUpdateStatusUI).toHaveBeenCalled();
    const callArgs = mockUpdateStatusUI.mock.calls[0];
    expect(callArgs[1]).toBe('loading');
  });
});

// ══════════════════════════════════════════════
// 5. enqueueAndTrack — queue change callback
// ══════════════════════════════════════════════

describe('enqueueAndTrack — queue position updates', () => {
  it('updates waiting status with queue position', async () => {
    let queueCallback;
    mockOnQueueChange.mockImplementation((cb) => {
      queueCallback = cb;
      return () => {};
    });
    mockEnqueueAnalysis.mockReturnValue(new Promise(() => {}));
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    // Simulate queue update with article in pending position 2
    queueCallback({ currentJob: null, pending: ['other-id', 'art-1'] });
    await new Promise(r => setTimeout(r, 50));

    const msg = container.querySelector('.analyze-status__message');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain('第 2 順位');
  });
});

// ══════════════════════════════════════════════
// 6. _unsubscribeQueue cleanup on re-render
// ══════════════════════════════════════════════

describe('_unsubscribeQueue cleanup', () => {
  it('calls previous unsubscribe when switching articles', async () => {
    const mockUnsub = vi.fn();
    mockOnQueueChange.mockReturnValue(mockUnsub);
    mockEnqueueAnalysis.mockReturnValue(new Promise(() => {}));
    localStorage.setItem('powerreader_gpu_consent', '1');

    // First render triggers enqueueAndTrack which sets _unsubscribeQueue
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle({ article_id: 'art-A' }) });
    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-A' });

    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      await new Promise(r => setTimeout(r, 50));
    }

    // Second render should unsubscribe the first queue listener
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle({ article_id: 'art-B' }) });
    await mod.renderArticle(container, { hash: 'art-B' });

    expect(mockUnsub).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 7. GPU consent — userOverride path
// ══════════════════════════════════════════════

describe('GPU consent — user override GPU selection', () => {
  it('displays user-selected GPU info when override exists', async () => {
    vi.resetModules();
    setupMocks();
    mockGetUserGPUSelection.mockReturnValue({ device: 'RTX 4090', vramMB: 24576 });
    registerMocks();
    mod = await import('../../src/lib/pages/article-detail.js');

    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const card = container.querySelector('.gpu-consent-card');
    expect(card).not.toBeNull();
    const rows = card.querySelectorAll('.gpu-consent-card__row');
    expect(rows.length).toBe(2);
    // Check GPU name
    const gpuValue = rows[0].querySelector('.gpu-consent-card__value');
    expect(gpuValue.textContent).toBe('RTX 4090');
  });
});

// ══════════════════════════════════════════════
// 8. GPU consent — archInfo path with inline picker
// ══════════════════════════════════════════════

describe('GPU consent — archInfo fallback with GPU picker', () => {
  it('renders GPU picker when archInfo is present and options available', async () => {
    vi.resetModules();
    setupMocks();
    mockScanGPU.mockResolvedValue({
      supported: true, vendor: 'nvidia', architecture: 'ada',
      device: '', vramMB: 0, gpuType: 'discrete',
      archInfo: { label: 'Ada Lovelace', series: 'RTX 40', vramRange: '8-24 GB' },
    });
    mockGetGPUOptionsForArch.mockReturnValue([
      { name: 'RTX 4060', vramMB: 8192 },
      { name: 'RTX 4070', vramMB: 12288 },
    ]);
    registerMocks();
    mod = await import('../../src/lib/pages/article-detail.js');

    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const card = container.querySelector('.gpu-consent-card');
    expect(card).not.toBeNull();

    // Should have picker hint and select element
    const hint = card.querySelector('.gpu-consent-card__picker-hint');
    expect(hint).not.toBeNull();

    const select = card.querySelector('.gpu-consent-card__select');
    expect(select).not.toBeNull();
    // placeholder + 2 options
    expect(select.querySelectorAll('option').length).toBe(3);
  });

  it('saves GPU selection when user picks from dropdown', async () => {
    vi.resetModules();
    setupMocks();
    mockScanGPU.mockResolvedValue({
      supported: true, vendor: 'nvidia', architecture: 'ada',
      device: '', vramMB: 0, gpuType: 'discrete',
      archInfo: { label: 'Ada Lovelace', series: 'RTX 40', vramRange: '8-24 GB' },
    });
    mockGetGPUOptionsForArch.mockReturnValue([
      { name: 'RTX 4060', vramMB: 8192 },
    ]);
    registerMocks();
    mod = await import('../../src/lib/pages/article-detail.js');

    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const select = container.querySelector('.gpu-consent-card__select');
    // Select the first real option
    select.value = JSON.stringify({ device: 'RTX 4060', vramMB: 8192 });
    select.dispatchEvent(new Event('change'));

    expect(mockSaveUserGPUSelection).toHaveBeenCalledWith('RTX 4060', 8192);
  });

  it('renders archInfo without picker when no options available', async () => {
    vi.resetModules();
    setupMocks();
    mockScanGPU.mockResolvedValue({
      supported: true, vendor: 'nvidia', architecture: 'ada',
      device: '', vramMB: 0, gpuType: 'discrete',
      archInfo: { label: 'Ada Lovelace', series: 'RTX 40', vramRange: '8-24 GB' },
    });
    mockGetGPUOptionsForArch.mockReturnValue([]);
    registerMocks();
    mod = await import('../../src/lib/pages/article-detail.js');

    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const card = container.querySelector('.gpu-consent-card');
    expect(card).not.toBeNull();
    // No picker since options is empty
    const select = card.querySelector('.gpu-consent-card__select');
    expect(select).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 9. GPU consent — vendor-only fallback (no device, no archInfo)
// ══════════════════════════════════════════════

describe('GPU consent — vendor-only fallback', () => {
  it('shows vendor name when no device info and no archInfo', async () => {
    vi.resetModules();
    setupMocks();
    mockScanGPU.mockResolvedValue({
      supported: true, vendor: 'intel', architecture: '',
      device: '', vramMB: 0, gpuType: 'integrated', archInfo: null,
    });
    registerMocks();
    mod = await import('../../src/lib/pages/article-detail.js');

    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const card = container.querySelector('.gpu-consent-card');
    expect(card).not.toBeNull();
    const gpuRow = card.querySelector('.gpu-consent-card__value');
    expect(gpuRow.textContent).toBe('intel');
  });
});

// ══════════════════════════════════════════════
// 10. GPU consent — confirm button triggers enqueue
// ══════════════════════════════════════════════

describe('GPU consent — confirm button', () => {
  it('sets consent and enqueues analysis on confirm click', async () => {
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    // Click analyze to show consent card
    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const consentCard = container.querySelector('.gpu-consent-card');
    expect(consentCard).not.toBeNull();

    // Click confirm button inside consent card
    const confirmBtn = consentCard.querySelector('.btn--primary');
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
    await new Promise(r => setTimeout(r, 50));

    expect(localStorage.getItem('powerreader_gpu_consent')).toBe('1');
    expect(mockEnqueueAnalysis).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 11. Auto-runner override button triggers enqueue
// ══════════════════════════════════════════════

describe('auto-runner override button', () => {
  it('enqueues analysis when override button clicked', async () => {
    mockGetAutoRunnerStatus.mockReturnValue({ running: true });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const overrideBtn = container.querySelector('.auto-runner-article-info .btn--secondary');
    expect(overrideBtn).not.toBeNull();
    overrideBtn.click();
    await new Promise(r => setTimeout(r, 50));

    expect(mockEnqueueAnalysis).toHaveBeenCalledWith('art-1', expect.any(Object), expect.any(Object));
  });
});

// ══════════════════════════════════════════════
// 12. Report dialog — submit handler
// ══════════════════════════════════════════════

describe('report dialog — submit', () => {
  it('submits report successfully', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('tok');
    mockReportArticle.mockResolvedValue({ success: true, data: {} });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    // Open report dialog
    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.body.querySelector('.report-overlay');
    expect(overlay).not.toBeNull();

    // Select a reason
    const firstRadio = overlay.querySelector('input[name="report-reason"]');
    firstRadio.checked = true;

    // Click submit
    const submitBtn = overlay.querySelector('.btn--primary');
    submitBtn.click();
    await new Promise(r => setTimeout(r, 100));

    // Overlay should be removed
    expect(document.body.querySelector('.report-overlay')).toBeNull();

    // Success message shown
    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('report.success');
  });

  it('shows duplicate warning on duplicate report', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('tok');
    mockReportArticle.mockResolvedValue({
      success: false, error: { type: 'duplicate_report' },
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.body.querySelector('.report-overlay');
    const firstRadio = overlay.querySelector('input[name="report-reason"]');
    firstRadio.checked = true;

    const submitBtn = overlay.querySelector('.btn--primary');
    submitBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('report.duplicate');
  });

  it('shows error on report failure', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('tok');
    mockReportArticle.mockResolvedValue({
      success: false, error: { message: 'Server down' },
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.body.querySelector('.report-overlay');
    const firstRadio = overlay.querySelector('input[name="report-reason"]');
    firstRadio.checked = true;

    const submitBtn = overlay.querySelector('.btn--primary');
    submitBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const msg = container.querySelector('.feedback-bar__message');
    expect(msg.textContent).toBe('Server down');
  });

  it('does nothing when no reason selected', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetAuthToken.mockReturnValue('tok');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.body.querySelector('.report-overlay');
    // Do NOT select a reason — click submit directly
    const submitBtn = overlay.querySelector('.btn--primary');
    submitBtn.click();
    await new Promise(r => setTimeout(r, 100));

    // Overlay should still exist (submit was no-op)
    expect(document.body.querySelector('.report-overlay')).not.toBeNull();
    expect(mockReportArticle).not.toHaveBeenCalled();
  });

  it('cancel button removes overlay', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });
    await new Promise(r => setTimeout(r, 50));

    const reportBtn = container.querySelector('.feedback-btn--report');
    reportBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const cancelBtn = document.body.querySelector('.report-overlay .btn--text');
    expect(cancelBtn).not.toBeNull();
    cancelBtn.click();
    await new Promise(r => setTimeout(r, 50));

    expect(document.body.querySelector('.report-overlay')).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 13. renderAnalysisError — error without message
// ══════════════════════════════════════════════

describe('renderAnalysisError — no error message', () => {
  it('does not render detail paragraph when error has no message', async () => {
    mockEnqueueAnalysis.mockRejectedValue({ message: '' });
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 100));

    // The error state should exist but no detail paragraph
    const section = container.querySelector('#analysis-section');
    const errState = section.querySelector('.error-state');
    expect(errState).not.toBeNull();
    const detail = section.querySelector('.analyze-status__elapsed');
    expect(detail).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 14. Auth blocked — login button click
// ══════════════════════════════════════════════

describe('analysis blocked — auth login button', () => {
  it('navigates to profile page and stores return URL on login click', async () => {
    mockRunPreAnalysisChecks.mockResolvedValue({
      canAnalyze: false,
      issues: [{ type: 'auth', message: 'Login required' }],
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    const analyzeBtn = container.querySelector('.btn--large');
    analyzeBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const loginBtn = container.querySelector('.analyze-blocked__item--auth .btn--primary');
    expect(loginBtn).not.toBeNull();
    loginBtn.click();

    expect(localStorage.getItem('powerreader_return_url')).toBe('#/article/art-1');
  });
});

// ══════════════════════════════════════════════
// 15. currentJob matches articleId in queue (isInQueue branch)
// ══════════════════════════════════════════════

describe('startAutoAnalysis — article currently in queue as currentJob', () => {
  it('directly enqueues when currentJob matches article', async () => {
    mockGetQueueStatus.mockReturnValue({
      currentJob: { articleId: 'art-1' },
      pending: [],
    });
    mockFetchArticle.mockResolvedValue({ success: true, data: makeArticle() });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'art-1' });

    // Should have immediately called enqueueAndTrack (shows waiting status)
    const msg = container.querySelector('.analyze-status__message');
    expect(msg).not.toBeNull();
    expect(mockEnqueueAnalysis).toHaveBeenCalled();
  });
});
