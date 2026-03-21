/**
 * Unit tests for analysis.svelte.ts (Analysis Store)
 *
 * Tests cover: getAnalysisStore, init/cleanup, analyze, cancel, cancelAll,
 *              startAuto, stopAuto, pauseAuto, resumeAuto, forceStopAuto,
 *              setMode, and all reactive getters.
 *
 * Strategy: Mock queue.js and auto-runner.js, test store interface via getters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock queue.js ──

const mockQueue = {
  enqueueAnalysis: vi.fn(),
  cancelAnalysis: vi.fn(),
  cancelAll: vi.fn(),
  onQueueChange: vi.fn(() => vi.fn()),
  getQueueStatus: vi.fn(() => ({
    pending: [],
    currentJob: null,
    completed: 0,
    failed: 0,
  })),
};

vi.mock('$lib/core/queue.js', () => mockQueue);

// ── Mock auto-runner.js ──

const mockAutoRunner = {
  startAutoRunner: vi.fn(),
  stopAutoRunner: vi.fn(),
  pauseAutoRunner: vi.fn(),
  resumeAutoRunner: vi.fn(),
  forceStopAutoRunner: vi.fn(),
  onAutoRunnerUpdate: vi.fn(() => vi.fn()),
  getAutoRunnerStatus: vi.fn(() => ({
    running: false,
    paused: false,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    stopReason: null,
    currentArticle: null,
  })),
  isAutoModeEnabled: vi.fn(() => false),
  setAnalysisMode: vi.fn(),
};

vi.mock('$lib/core/auto-runner.js', () => mockAutoRunner);

// ── Dynamic module import ──

let analysisModule;
let store;

async function loadModule() {
  return await import('../../src/lib/stores/analysis.svelte.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();

  mockQueue.enqueueAnalysis.mockReset();
  mockQueue.cancelAnalysis.mockReset();
  mockQueue.cancelAll.mockReset();
  mockQueue.onQueueChange.mockReturnValue(vi.fn());
  mockQueue.getQueueStatus.mockReturnValue({
    pending: [],
    currentJob: null,
    completed: 0,
    failed: 0,
  });

  mockAutoRunner.startAutoRunner.mockReset();
  mockAutoRunner.stopAutoRunner.mockReset();
  mockAutoRunner.pauseAutoRunner.mockReset();
  mockAutoRunner.resumeAutoRunner.mockReset();
  mockAutoRunner.forceStopAutoRunner.mockReset();
  mockAutoRunner.onAutoRunnerUpdate.mockReturnValue(vi.fn());
  mockAutoRunner.getAutoRunnerStatus.mockReturnValue({
    running: false,
    paused: false,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    stopReason: null,
    currentArticle: null,
  });
  mockAutoRunner.isAutoModeEnabled.mockReturnValue(false);
  mockAutoRunner.setAnalysisMode.mockReset();

  vi.mock('$lib/core/queue.js', () => mockQueue);
  vi.mock('$lib/core/auto-runner.js', () => mockAutoRunner);

  analysisModule = await loadModule();
  store = analysisModule.getAnalysisStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. Store structure
// ══════════════════════════════════════════════

describe('getAnalysisStore — structure', () => {
  it('returns an object with expected getters', () => {
    expect(store).toBeDefined();
    expect(typeof store.queueStatus).toBe('object');
    expect(typeof store.isAutoRunning).toBe('boolean');
    expect(typeof store.isAutoPaused).toBe('boolean');
    expect(typeof store.isAutoModeEnabled).toBe('boolean');
  });

  it('has expected methods', () => {
    expect(typeof store.init).toBe('function');
    expect(typeof store.analyze).toBe('function');
    expect(typeof store.cancel).toBe('function');
    expect(typeof store.cancelAll).toBe('function');
    expect(typeof store.startAuto).toBe('function');
    expect(typeof store.stopAuto).toBe('function');
    expect(typeof store.pauseAuto).toBe('function');
    expect(typeof store.resumeAuto).toBe('function');
    expect(typeof store.forceStopAuto).toBe('function');
    expect(typeof store.setMode).toBe('function');
  });
});

// ══════════════════════════════════════════════
// 2. Default state
// ══════════════════════════════════════════════

describe('getAnalysisStore — default state', () => {
  it('has no current analysis', () => {
    expect(store.currentAnalysis).toBeNull();
  });

  it('has no analysis error', () => {
    expect(store.analysisError).toBeNull();
  });

  it('has null analysisStage', () => {
    expect(store.analysisStage).toBeNull();
  });

  it('has null eta', () => {
    expect(store.eta).toBeNull();
  });

  it('has 0 progress', () => {
    expect(store.progress).toBe(0);
  });

  it('has empty pending queue', () => {
    expect(store.pendingIds).toEqual([]);
  });

  it('has no current job', () => {
    expect(store.currentJob).toBeNull();
  });

  it('auto-runner is not running', () => {
    expect(store.isAutoRunning).toBe(false);
    expect(store.isAutoPaused).toBe(false);
  });

  it('auto stats are zeroed', () => {
    expect(store.autoStats).toEqual({ analyzed: 0, failed: 0, skipped: 0 });
  });

  it('auto stop reason is null', () => {
    expect(store.autoStopReason).toBeNull();
  });

  it('auto current article is null', () => {
    expect(store.autoCurrentArticle).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 3. init / cleanup
// ══════════════════════════════════════════════

describe('init', () => {
  it('subscribes to queue and auto-runner events', () => {
    const cleanup = store.init();
    expect(mockQueue.onQueueChange).toHaveBeenCalledTimes(1);
    expect(mockAutoRunner.onAutoRunnerUpdate).toHaveBeenCalledTimes(1);
    expect(typeof cleanup).toBe('function');
  });

  it('cleanup function calls unsubscribers', () => {
    const unsubQueue = vi.fn();
    const unsubAutoRunner = vi.fn();
    mockQueue.onQueueChange.mockReturnValue(unsubQueue);
    mockAutoRunner.onAutoRunnerUpdate.mockReturnValue(unsubAutoRunner);

    const cleanup = store.init();
    cleanup();

    expect(unsubQueue).toHaveBeenCalledTimes(1);
    expect(unsubAutoRunner).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════
// 4. analyze
// ══════════════════════════════════════════════

describe('analyze', () => {
  it('calls enqueueAnalysis with correct args', async () => {
    const article = { article_id: 'a1', title: 'Test' };
    const result = { bias_score: 60, points: [], key_phrases: [] };
    mockQueue.enqueueAnalysis.mockResolvedValue(result);

    const analysisResult = await store.analyze('a1', article);

    expect(mockQueue.enqueueAnalysis).toHaveBeenCalledWith('a1', article, expect.objectContaining({ onStatus: expect.any(Function) }));
    expect(analysisResult).toEqual(result);
  });

  it('resets state after successful analysis', async () => {
    mockQueue.enqueueAnalysis.mockResolvedValue({ bias_score: 50 });
    await store.analyze('a1', { article_id: 'a1', title: 'T' });

    expect(store.currentAnalysis).toBeNull();
    expect(store.analysisStage).toBeNull();
    expect(store.eta).toBeNull();
    expect(store.progress).toBe(0);
  });

  it('sets analysisError on failure and re-throws', async () => {
    mockQueue.enqueueAnalysis.mockRejectedValue(new Error('GPU OOM'));

    await expect(store.analyze('a1', { article_id: 'a1', title: 'T' }))
      .rejects.toThrow('GPU OOM');

    expect(store.analysisError).toBe('GPU OOM');
    expect(store.currentAnalysis).toBeNull();
    expect(store.analysisStage).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 5. cancel / cancelAll
// ══════════════════════════════════════════════

describe('cancel', () => {
  it('calls cancelAnalysis on queue', () => {
    store.cancel('a1');
    expect(mockQueue.cancelAnalysis).toHaveBeenCalledWith('a1');
  });
});

describe('cancelAll', () => {
  it('calls cancelAll on queue', () => {
    store.cancelAll();
    expect(mockQueue.cancelAll).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════
// 6. Auto-runner controls
// ══════════════════════════════════════════════

describe('auto-runner controls', () => {
  it('startAuto calls startAutoRunner', async () => {
    mockAutoRunner.startAutoRunner.mockResolvedValue(undefined);
    await store.startAuto();
    expect(mockAutoRunner.startAutoRunner).toHaveBeenCalledTimes(1);
  });

  it('stopAuto calls stopAutoRunner', () => {
    store.stopAuto();
    expect(mockAutoRunner.stopAutoRunner).toHaveBeenCalledTimes(1);
  });

  it('pauseAuto calls pauseAutoRunner', () => {
    store.pauseAuto();
    expect(mockAutoRunner.pauseAutoRunner).toHaveBeenCalledTimes(1);
  });

  it('resumeAuto calls resumeAutoRunner', () => {
    store.resumeAuto();
    expect(mockAutoRunner.resumeAutoRunner).toHaveBeenCalledTimes(1);
  });

  it('forceStopAuto calls forceStopAutoRunner', () => {
    store.forceStopAuto();
    expect(mockAutoRunner.forceStopAutoRunner).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════
// 7. setMode
// ══════════════════════════════════════════════

describe('setMode', () => {
  it('sets analysis mode to auto', () => {
    store.setMode('auto');
    expect(mockAutoRunner.setAnalysisMode).toHaveBeenCalledWith('auto');
  });

  it('sets analysis mode to manual', () => {
    store.setMode('manual');
    expect(mockAutoRunner.setAnalysisMode).toHaveBeenCalledWith('manual');
  });
});
