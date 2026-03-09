/**
 * Unit tests for auto-runner.js (Auto Runner)
 *
 * Tests cover: getAutoRunnerStatus, onAutoRunnerUpdate, isAutoModeEnabled,
 *              setAnalysisMode, startAutoRunner, stopAutoRunner
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module-level reset helpers ──

let mod;
let mockEnqueueAnalysis, mockFetchArticles, mockSubmitAnalysisResult;
let mockGetAuthToken, mockGetUserHash, mockIsAuthenticated;
let mockOpenDB, mockT;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();

  mockEnqueueAnalysis = vi.fn();
  mockFetchArticles = vi.fn();
  mockSubmitAnalysisResult = vi.fn();
  mockGetAuthToken = vi.fn(() => 'token');
  mockGetUserHash = vi.fn(() => 'hash');
  mockIsAuthenticated = vi.fn(() => true);
  mockOpenDB = vi.fn();
  mockT = vi.fn((key) => key);

  vi.doMock('../../src/js/model/queue.js', () => ({
    enqueueAnalysis: mockEnqueueAnalysis,
    AnalysisCancelledError: class AnalysisCancelledError extends Error {
      constructor(id) {
        super(id);
        this.name = 'AnalysisCancelledError';
      }
    },
  }));
  vi.doMock('../../src/js/api.js', () => ({
    fetchArticles: mockFetchArticles,
    submitAnalysisResult: mockSubmitAnalysisResult,
  }));
  vi.doMock('../../src/js/auth.js', () => ({
    getAuthToken: mockGetAuthToken,
    getUserHash: mockGetUserHash,
    isAuthenticated: mockIsAuthenticated,
  }));
  vi.doMock('../../src/js/db.js', () => ({
    openDB: mockOpenDB,
  }));
  vi.doMock('../../src/locale/zh-TW.js', () => ({ t: mockT }));

  mod = await import('../../src/js/model/auto-runner.js');
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
      stopping: false,
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
  it('sets stopping=true when runner is active', async () => {
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
    expect(mod.getAutoRunnerStatus().stopping).toBe(true);

    // Resolve fetchArticles to let the loop exit
    resolveFetch({ success: false, data: null });
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    const finalStatus = mod.getAutoRunnerStatus();
    expect(finalStatus.running).toBe(false);
    expect(finalStatus.stopping).toBe(false);
  });

  it('has no side effects when runner is not started', () => {
    const statusBefore = mod.getAutoRunnerStatus();

    mod.stopAutoRunner();

    const statusAfter = mod.getAutoRunnerStatus();
    expect(statusAfter).toEqual(statusBefore);
  });

  it('has no side effects when called twice while running', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    localStorage.setItem('powerreader_webllm_cached', '1');
    setupMockDB();

    let resolveFetch;
    mockFetchArticles.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    const promise = mod.startAutoRunner();
    await vi.advanceTimersByTimeAsync(0);

    mod.stopAutoRunner();
    // Second call should be a no-op (already stopping)
    mod.stopAutoRunner();

    expect(mod.getAutoRunnerStatus().stopping).toBe(true);

    resolveFetch({ success: false, data: null });
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });
});
