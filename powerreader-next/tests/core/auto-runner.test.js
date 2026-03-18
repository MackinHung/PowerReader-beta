/**
 * Unit tests for auto-runner.js (Auto Runner)
 *
 * Tests cover: getAutoRunnerStatus, onAutoRunnerUpdate, isAutoModeEnabled,
 *              setAnalysisMode, startAutoRunner, stopAutoRunner
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module-level reset helpers ──

let mod;
let mockEnqueueAnalysis, mockCancelAll, mockFetchArticles, mockSubmitAnalysisResult;
let mockFetchEvents, mockSearchArticles, mockFetchArticle, mockFetchUserPoints;
let mockGetAuthToken, mockGetUserHash, mockIsAuthenticated;
let mockOpenDB, mockT;
let mockScanGPU;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();

  mockEnqueueAnalysis = vi.fn();
  mockCancelAll = vi.fn();
  mockFetchArticles = vi.fn();
  mockSubmitAnalysisResult = vi.fn();
  mockFetchEvents = vi.fn().mockResolvedValue({ success: false });
  mockSearchArticles = vi.fn().mockResolvedValue({ success: false });
  mockFetchArticle = vi.fn().mockResolvedValue({ success: false });
  mockFetchUserPoints = vi.fn().mockResolvedValue({
    success: true,
    data: { daily_analysis_count: 0, daily_analysis_limit: 50 },
  });
  mockGetAuthToken = vi.fn(() => 'token');
  mockGetUserHash = vi.fn(() => 'hash');
  mockIsAuthenticated = vi.fn(() => true);
  mockOpenDB = vi.fn();
  mockT = vi.fn((key) => key);
  mockScanGPU = vi.fn(() => Promise.resolve({ supported: true, vramMB: 8192 }));

  vi.doMock('../../src/lib/core/benchmark.js', () => ({
    scanGPU: mockScanGPU,
    getCachedBenchmark: vi.fn(() => ({ mode: 'gpu' })),
  }));
  vi.doMock('../../src/lib/core/queue.js', () => ({
    enqueueAnalysis: mockEnqueueAnalysis,
    cancelAll: mockCancelAll,
    AnalysisCancelledError: class AnalysisCancelledError extends Error {
      constructor(id) {
        super(id);
        this.name = 'AnalysisCancelledError';
      }
    },
  }));
  vi.doMock('../../src/lib/core/api.js', () => ({
    fetchArticles: mockFetchArticles,
    fetchArticle: mockFetchArticle,
    fetchEvents: mockFetchEvents,
    searchArticles: mockSearchArticles,
    submitAnalysisResult: mockSubmitAnalysisResult,
    fetchUserPoints: mockFetchUserPoints,
  }));
  vi.doMock('../../src/lib/core/auth.js', () => ({
    getAuthToken: mockGetAuthToken,
    getUserHash: mockGetUserHash,
    isAuthenticated: mockIsAuthenticated,
  }));
  vi.doMock('../../src/lib/core/db.js', () => ({
    openDB: mockOpenDB,
  }));
  vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({ t: mockT }));

  mod = await import('../../src/lib/core/auto-runner.js');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ── Helper: mock openDB for IndexedDB operations ──

function setupMockDB(processedKeys = []) {
  const mockStore = {
    getAllKeys: () => {
      const req = { result: processedKeys, onsuccess: null, onerror: null };
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
    put: vi.fn(),
  };
  const mockTx = {
    objectStore: () => mockStore,
    oncomplete: null,
    onerror: null,
  };
  // For recording history, auto-resolve the transaction
  const origObjectStore = mockTx.objectStore;
  mockTx.objectStore = vi.fn((...args) => {
    // Schedule oncomplete
    Promise.resolve().then(() => mockTx.oncomplete?.());
    return origObjectStore(...args);
  });

  mockOpenDB.mockResolvedValue({
    transaction: () => mockTx,
    close: vi.fn(),
  });
}

// ══════════════════════════════════════════════
// 1. getAutoRunnerStatus
// ══════════════════════════════════════════════

describe('getAutoRunnerStatus', () => {
  it('returns correct initial state', () => {
    const status = mod.getAutoRunnerStatus();
    expect(status).toEqual({
      running: false,
      paused: false,
      analyzed: 0,
      failed: 0,
      skipped: 0,
      currentArticle: null,
      startedAt: null,
      stopReason: null,
    });
  });

  it('returns an immutable snapshot (changing returned object does not affect internal state)', () => {
    const status1 = mod.getAutoRunnerStatus();
    status1.running = true;
    status1.analyzed = 999;

    const status2 = mod.getAutoRunnerStatus();
    expect(status2.running).toBe(false);
    expect(status2.analyzed).toBe(0);
  });
});

// ══════════════════════════════════════════════
// 2. onAutoRunnerUpdate
// ══════════════════════════════════════════════

describe('onAutoRunnerUpdate', () => {
  it('calls callback when state changes (via startAutoRunner failing auth)', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    const cb = vi.fn();
    mod.onAutoRunnerUpdate(cb);

    await mod.startAutoRunner();

    expect(cb).toHaveBeenCalled();
    const lastCallArg = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(lastCallArg.stopReason).toBe('auto_runner.error.not_logged_in');
  });

  it('unsubscribe stops further callbacks', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    const cb = vi.fn();
    const unsub = mod.onAutoRunnerUpdate(cb);

    unsub();

    await mod.startAutoRunner();

    expect(cb).not.toHaveBeenCalled();
  });

  it('multiple subscribers all get notified', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    mod.onAutoRunnerUpdate(cb1);
    mod.onAutoRunnerUpdate(cb2);

    await mod.startAutoRunner();

    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('listener error does not prevent other listeners from being called', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    const errCb = vi.fn(() => {
      throw new Error('listener error');
    });
    const goodCb = vi.fn();
    mod.onAutoRunnerUpdate(errCb);
    mod.onAutoRunnerUpdate(goodCb);

    await mod.startAutoRunner();

    expect(errCb).toHaveBeenCalled();
    expect(goodCb).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 3. isAutoModeEnabled / setAnalysisMode
// ══════════════════════════════════════════════

describe('isAutoModeEnabled / setAnalysisMode', () => {
  it('returns false by default (no localStorage value)', () => {
    expect(mod.isAutoModeEnabled()).toBe(false);
  });

  it('returns true after setAnalysisMode("auto")', () => {
    mod.setAnalysisMode('auto');
    expect(mod.isAutoModeEnabled()).toBe(true);
  });

  it('returns false after setAnalysisMode("manual")', () => {
    mod.setAnalysisMode('auto');
    expect(mod.isAutoModeEnabled()).toBe(true);

    mod.setAnalysisMode('manual');
    expect(mod.isAutoModeEnabled()).toBe(false);
  });

  it('stores value in localStorage with correct key', () => {
    mod.setAnalysisMode('auto');
    expect(localStorage.getItem('powerreader_analysis_mode')).toBe('auto');
  });
});

// ══════════════════════════════════════════════
// 4. startAutoRunner
// ══════════════════════════════════════════════

describe('startAutoRunner', () => {
  it('does not start when not authenticated; sets stopReason', async () => {
    mockIsAuthenticated.mockReturnValue(false);

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.stopReason).toBe('auto_runner.error.not_logged_in');
  });

  it('does not start when model not downloaded; sets stopReason', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    // powerreader_webllm_cached is not set

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.stopReason).toBe('auto_runner.error.model_not_ready');
  });

  it('does not duplicate-start when already running', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    // fetchArticles will hang until resolved, keeping the runner in _running state
    let resolveFetch;
    mockFetchArticles.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    // Start first run (async, will block on fetchArticles)
    const p1 = mod.startAutoRunner();
    // Advance microtasks so _running becomes true
    await vi.advanceTimersByTimeAsync(0);

    // Runner should be running now
    expect(mod.getAutoRunnerStatus().running).toBe(true);

    // Attempt a second start while first is running
    const p2 = mod.startAutoRunner();
    await p2; // Should return immediately (no-op)

    // fetchArticles should only have been called once (from first start)
    expect(mockFetchArticles).toHaveBeenCalledTimes(1);

    // Clean up: resolve the pending fetch so p1 completes
    resolveFetch({ success: false, data: null });
    await vi.advanceTimersByTimeAsync(0);
    await p1;
  });

  it('stops with no_articles when fetchArticles returns empty', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [] },
    });

    const cb = vi.fn();
    mod.onAutoRunnerUpdate(cb);

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.stopReason).toBe('auto_runner.error.no_articles');
  });

  it('stops with no_articles when fetchArticles returns success=false', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchArticles.mockResolvedValue({
      success: false,
      data: null,
    });

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.stopReason).toBe('auto_runner.error.no_articles');
  });

  it('stops with no_articles when all articles are already processed', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB(['article-1', 'article-2']);

    mockFetchArticles.mockResolvedValue({
      success: true,
      data: {
        articles: [
          { article_id: 'article-1', title: 'Title 1' },
          { article_id: 'article-2', title: 'Title 2' },
        ],
      },
    });

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.stopReason).toBe('auto_runner.error.no_articles');
  });

  it('processes an article successfully and updates stats', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    const articles = [
      { article_id: 'a1', title: 'Test Article' },
    ];

    // fetchArticles: first call returns articles, second returns empty to stop loop
    mockFetchArticles
      .mockResolvedValueOnce({ success: true, data: { articles } })
      .mockResolvedValueOnce({ success: true, data: { articles: [] } });

    mockEnqueueAnalysis.mockResolvedValue({
      bias_score: 0.5,
      controversy_score: 0.3,
      reasoning: 'test',
      key_phrases: [],
      points: [],
      prompt_version: 'v3.0.0',
      latency_ms: 100,
      mode: 'webgpu',
    });

    mockSubmitAnalysisResult.mockResolvedValue({ success: true });

    const promise = mod.startAutoRunner();
    // Advance past all timers (inter-analysis delay)
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    const status = mod.getAutoRunnerStatus();
    expect(status.analyzed).toBe(1);
    expect(status.failed).toBe(0);
  });
});

// ══════════════════════════════════════════════
// 5. stopAutoRunner
// ══════════════════════════════════════════════

describe('stopAutoRunner', () => {
  it('sets paused=true when runner is active', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    // fetchArticles will hang until resolved
    let resolveFetch;
    mockFetchArticles.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    const cb = vi.fn();
    mod.onAutoRunnerUpdate(cb);

    // Start the runner (will be awaiting fetchArticles)
    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(0);

    // Now the runner should be running
    expect(mod.getAutoRunnerStatus().running).toBe(true);

    // Stop it
    mod.stopAutoRunner();
    expect(mod.getAutoRunnerStatus().paused).toBe(true);

    // Resolve fetchArticles to let the loop exit
    resolveFetch({ success: false, data: null });
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    const finalStatus = mod.getAutoRunnerStatus();
    expect(finalStatus.running).toBe(false);
    expect(finalStatus.paused).toBe(false);
  });

  it('has no side effects when runner is not started', () => {
    const statusBefore = mod.getAutoRunnerStatus();

    mod.stopAutoRunner();

    const statusAfter = mod.getAutoRunnerStatus();
    expect(statusAfter).toEqual(statusBefore);
  });

  it('force-stops by calling cancelAll when called twice while running', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    let resolveFetch;
    mockFetchArticles.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(0);

    // First call: pause
    mod.stopAutoRunner();
    expect(mod.getAutoRunnerStatus().paused).toBe(true);
    expect(mockCancelAll).not.toHaveBeenCalled();

    // Second call: force stop — cancels running inference
    mod.stopAutoRunner();
    expect(mockCancelAll).toHaveBeenCalledTimes(1);

    resolveFetch({ success: false, data: null });
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });
});

// ══════════════════════════════════════════════
// 6. pauseAutoRunner / resumeAutoRunner / forceStopAutoRunner
// ══════════════════════════════════════════════

describe('pauseAutoRunner', () => {
  it('pauses and resumeAutoRunner continues the loop', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    const articles = [
      { article_id: 'a1', title: 'Test 1' },
      { article_id: 'a2', title: 'Test 2' },
    ];

    // First fetch returns articles, second returns empty to end loop
    mockFetchArticles
      .mockResolvedValueOnce({ success: true, data: { articles } })
      .mockResolvedValueOnce({ success: true, data: { articles: [] } });

    mockEnqueueAnalysis.mockResolvedValue({
      bias_score: 0.5, controversy_score: 0.3,
      reasoning: 'test', key_phrases: [], points: [],
      prompt_version: 'v3.0.0', latency_ms: 100, mode: 'webgpu',
    });
    mockSubmitAnalysisResult.mockResolvedValue({ success: true });

    const promise = mod.startAutoRunner();
    // Let microtasks run — loop processes first article then hits _delay(2000)
    await vi.advanceTimersByTimeAsync(0);

    // Pause (aborts delay timer, loop continues to next article, hits _waitForResume)
    mod.pauseAutoRunner();
    await vi.advanceTimersByTimeAsync(0); // flush microtasks so loop suspends

    expect(mod.getAutoRunnerStatus().paused).toBe(true);
    expect(mod.getAutoRunnerStatus().running).toBe(true);

    // Resume
    mod.resumeAutoRunner();
    expect(mod.getAutoRunnerStatus().paused).toBe(false);
    expect(mod.getAutoRunnerStatus().running).toBe(true);

    // Let rest of loop finish (process second article + inter-delay + next fetch returns empty)
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(mod.getAutoRunnerStatus().running).toBe(false);
  });

  it('forceStopAutoRunner cancels everything and exits', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    let resolveFetch;
    mockFetchArticles.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(0);

    // Pause first
    mod.pauseAutoRunner();
    expect(mod.getAutoRunnerStatus().paused).toBe(true);

    // Force stop
    mod.forceStopAutoRunner();
    expect(mockCancelAll).toHaveBeenCalledTimes(1);

    // Runner should be fully stopped
    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.paused).toBe(false);

    resolveFetch({ success: false, data: null });
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });
});

// ══════════════════════════════════════════════
// 7. Cluster-priority ordering
// ══════════════════════════════════════════════

describe('cluster-priority ordering', () => {
  it('fetches events first and searches articles per cluster', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchEvents
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [
            { cluster_id: 'c1', title: '美國大選結果分析報導' },
            { cluster_id: 'c2', title: '台灣半導體政策討論' },
          ],
        },
      })
      .mockResolvedValueOnce({ success: false }); // 2nd iteration → no events

    mockSearchArticles
      .mockResolvedValueOnce({
        success: true,
        data: { articles: [{ article_id: 'a1', title: 'Article from cluster 1' }] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { articles: [{ article_id: 'a2', title: 'Article from cluster 2' }] },
      });

    // fetchArticle pre-check: not yet analyzed
    mockFetchArticle.mockResolvedValue({ success: true, data: { analysis_count: 0 } });

    mockEnqueueAnalysis.mockResolvedValue({
      bias_score: 50, controversy_score: 30,
      reasoning: 'test', key_phrases: [], points: [],
      prompt_version: 'v3.0.0', latency_ms: 100, mode: 'webgpu',
    });
    mockSubmitAnalysisResult.mockResolvedValue({ success: true });

    // Fallback when no events: empty articles → stop
    mockFetchArticles.mockResolvedValue({ success: true, data: { articles: [] } });

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(30000);
    await promise;

    // Should have searched for articles in both clusters
    expect(mockSearchArticles).toHaveBeenCalledTimes(2);
    // Should have analyzed both articles
    expect(mockEnqueueAnalysis).toHaveBeenCalledTimes(2);
    expect(mod.getAutoRunnerStatus().analyzed).toBe(2);
  });

  it('deduplicates articles across clusters', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchEvents.mockResolvedValueOnce({
      success: true,
      data: {
        items: [
          { cluster_id: 'c1', title: '重複事件測試一' },
          { cluster_id: 'c2', title: '重複事件測試二' },
        ],
      },
    });

    // Both clusters return the same article
    const sameArticle = { article_id: 'dup-1', title: 'Shared article' };
    mockSearchArticles
      .mockResolvedValueOnce({ success: true, data: { articles: [sameArticle] } })
      .mockResolvedValueOnce({ success: true, data: { articles: [sameArticle] } });

    mockFetchArticle.mockResolvedValue({ success: true, data: { analysis_count: 0 } });
    mockEnqueueAnalysis.mockResolvedValue({
      bias_score: 50, controversy_score: 30,
      reasoning: 'test', key_phrases: [], points: [],
      prompt_version: 'v3.0.0', latency_ms: 100, mode: 'webgpu',
    });
    mockSubmitAnalysisResult.mockResolvedValue({ success: true });

    // Stop on second iteration
    mockFetchEvents.mockResolvedValueOnce({ success: false });
    mockFetchArticles.mockResolvedValue({ success: true, data: { articles: [] } });

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(30000);
    await promise;

    // Should only analyze once despite appearing in two clusters
    expect(mockEnqueueAnalysis).toHaveBeenCalledTimes(1);
  });

  it('falls back to flat article list when no events available', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    // No events
    mockFetchEvents.mockResolvedValue({ success: false });

    // Flat articles available
    mockFetchArticles
      .mockResolvedValueOnce({
        success: true,
        data: { articles: [{ article_id: 'flat-1', title: 'Flat article' }] },
      })
      .mockResolvedValueOnce({ success: true, data: { articles: [] } });

    mockFetchArticle.mockResolvedValue({ success: true, data: { analysis_count: 0 } });
    mockEnqueueAnalysis.mockResolvedValue({
      bias_score: 50, controversy_score: 30,
      reasoning: 'test', key_phrases: [], points: [],
      prompt_version: 'v3.0.0', latency_ms: 100, mode: 'webgpu',
    });
    mockSubmitAnalysisResult.mockResolvedValue({ success: true });

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(30000);
    await promise;

    expect(mockFetchArticles).toHaveBeenCalled();
    expect(mockEnqueueAnalysis).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════
// 8. Pre-analysis duplicate check
// ══════════════════════════════════════════════

describe('pre-analysis duplicate check', () => {
  it('skips article if fresh API check shows already analyzed', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    // No events → fallback to flat
    mockFetchEvents.mockResolvedValue({ success: false });
    mockFetchArticles
      .mockResolvedValueOnce({
        success: true,
        data: { articles: [{ article_id: 'already-done', title: 'Done' }] },
      })
      .mockResolvedValueOnce({ success: true, data: { articles: [] } });

    // Pre-check: article already has analysis
    mockFetchArticle.mockResolvedValue({
      success: true,
      data: { analysis_count: 1 },
    });

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(30000);
    await promise;

    // Should NOT have called enqueueAnalysis (skipped due to duplicate)
    expect(mockEnqueueAnalysis).not.toHaveBeenCalled();
    expect(mod.getAutoRunnerStatus().skipped).toBe(1);
  });

  it('proceeds with analysis if pre-check fails (network error)', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchEvents.mockResolvedValue({ success: false });
    mockFetchArticles
      .mockResolvedValueOnce({
        success: true,
        data: { articles: [{ article_id: 'a1', title: 'Test' }] },
      })
      .mockResolvedValueOnce({ success: true, data: { articles: [] } });

    // Pre-check fails
    mockFetchArticle.mockRejectedValue(new Error('network error'));

    mockEnqueueAnalysis.mockResolvedValue({
      bias_score: 50, controversy_score: 30,
      reasoning: 'test', key_phrases: [], points: [],
      prompt_version: 'v3.0.0', latency_ms: 100, mode: 'webgpu',
    });
    mockSubmitAnalysisResult.mockResolvedValue({ success: true });

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(30000);
    await promise;

    // Should still analyze (pre-check failure doesn't block)
    expect(mockEnqueueAnalysis).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════
// 9. Daily quota check before start
// ══════════════════════════════════════════════

describe('daily quota check', () => {
  it('stops with quota_exhausted when daily limit reached', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');

    mockFetchUserPoints.mockResolvedValue({
      success: true,
      data: { daily_analysis_count: 50, daily_analysis_limit: 50 },
    });

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.running).toBe(false);
    expect(status.stopReason).toBe('auto_runner.quota_exhausted');
  });

  it('proceeds normally when quota remains', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchUserPoints.mockResolvedValue({
      success: true,
      data: { daily_analysis_count: 10, daily_analysis_limit: 50 },
    });

    mockFetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [] },
    });

    await mod.startAutoRunner();

    // Should have proceeded past quota check (stopped due to no articles)
    const status = mod.getAutoRunnerStatus();
    expect(status.stopReason).toBe('auto_runner.error.no_articles');
  });

  it('proceeds when quota fetch fails (non-fatal)', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchUserPoints.mockRejectedValue(new Error('Network error'));

    mockFetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [] },
    });

    await mod.startAutoRunner();

    // Should proceed past quota check (non-fatal failure)
    const status = mod.getAutoRunnerStatus();
    expect(status.stopReason).toBe('auto_runner.error.no_articles');
  });

  it('proceeds when quota response has no data', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    mockFetchUserPoints.mockResolvedValue({ success: false });

    mockFetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [] },
    });

    await mod.startAutoRunner();

    const status = mod.getAutoRunnerStatus();
    expect(status.stopReason).toBe('auto_runner.error.no_articles');
  });
});
