/**
 * Unit tests for queue.js - Analysis Queue Manager
 *
 * Tests cover: AnalysisCancelledError, getQueueStatus, onQueueChange,
 *              enqueueAnalysis, cancelAnalysis, cancelAll
 *
 * Module-level singleton state is reset via vi.resetModules() + dynamic import
 * in each test to ensure isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared references (re-assigned in beforeEach) ──

let mod;
let mockRunAnalysis;
let mockFetchKnowledge;

beforeEach(async () => {
  vi.resetModules();

  mockRunAnalysis = vi.fn();
  mockFetchKnowledge = vi.fn();

  vi.doMock('../../src/js/model/inference.js', () => ({
    runAnalysis: mockRunAnalysis,
  }));
  vi.doMock('../../src/js/api.js', () => ({
    fetchArticleKnowledge: mockFetchKnowledge,
  }));

  mod = await import('../../src/js/model/queue.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ──

function makeArticle(id) {
  return { id, title: `Article ${id}`, content: `Content of ${id}` };
}

/** Create a deferred promise pair for manual resolution control. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Suppress an expected rejection so it does not become an unhandled rejection. */
function suppressRejection(promise) {
  promise.catch(() => {});
}

// ══════════════════════════════════════════════
// 1. AnalysisCancelledError
// ══════════════════════════════════════════════

describe('AnalysisCancelledError', () => {
  it('is an instance of Error', () => {
    const err = new mod.AnalysisCancelledError('art-1');
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to AnalysisCancelledError', () => {
    const err = new mod.AnalysisCancelledError('art-1');
    expect(err.name).toBe('AnalysisCancelledError');
  });

  it('sets message containing the articleId', () => {
    const err = new mod.AnalysisCancelledError('art-1');
    expect(err.message).toBe('Analysis cancelled: art-1');
  });

  it('stores articleId property', () => {
    const err = new mod.AnalysisCancelledError('art-1');
    expect(err.articleId).toBe('art-1');
  });
});

// ══════════════════════════════════════════════
// 2. getQueueStatus
// ══════════════════════════════════════════════

describe('getQueueStatus', () => {
  it('returns null currentJob and empty pending initially', () => {
    const status = mod.getQueueStatus();
    expect(status).toEqual({ currentJob: null, pending: [] });
  });
});

// ══════════════════════════════════════════════
// 3. onQueueChange
// ══════════════════════════════════════════════

describe('onQueueChange', () => {
  it('fires callback when a job is enqueued', async () => {
    const d = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d.promise);

    const listener = vi.fn();
    mod.onQueueChange(listener);

    mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    // Allow microtasks to flush
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    // Resolve the pending job to clean up
    d.resolve({ summary: 'ok' });
  });

  it('stops firing after unsubscribe is called', async () => {
    const d = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d.promise);

    const listener = vi.fn();
    const unsub = mod.onQueueChange(listener);

    // First enqueue triggers listener
    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    suppressRejection(p1); // cancelAnalysis will reject it
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    const countAfterFirst = listener.mock.calls.length;
    unsub();

    // Cancel to trigger another notification cycle
    mod.cancelAnalysis('art-1');

    // Give microtasks a chance to run
    await new Promise((r) => setTimeout(r, 10));

    expect(listener.mock.calls.length).toBe(countAfterFirst);
    d.resolve({ summary: 'ok' });
  });

  it('does not throw if listener callback throws', async () => {
    const d = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d.promise);

    const badListener = vi.fn(() => { throw new Error('listener boom'); });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mod.onQueueChange(badListener);

    // Should not throw
    mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    await vi.waitFor(() => expect(badListener).toHaveBeenCalled());

    expect(consoleError).toHaveBeenCalled();
    d.resolve({ summary: 'ok' });
    consoleError.mockRestore();
  });
});

// ══════════════════════════════════════════════
// 4. enqueueAnalysis
// ══════════════════════════════════════════════

describe('enqueueAnalysis', () => {
  it('calls fetchArticleKnowledge then runAnalysis and resolves with result', async () => {
    const knowledgeEntries = [{ id: 'k1', text: 'some knowledge' }];
    mockFetchKnowledge.mockResolvedValue({
      success: true,
      data: { knowledge_entries: knowledgeEntries },
    });
    const analysisResult = { summary: 'test summary', bias_score: 0.5 };
    mockRunAnalysis.mockResolvedValue(analysisResult);

    const result = await mod.enqueueAnalysis('art-1', makeArticle('art-1'), { mode: 'full' });

    expect(mockFetchKnowledge).toHaveBeenCalledWith('art-1');
    expect(mockRunAnalysis).toHaveBeenCalledWith({
      article: makeArticle('art-1'),
      knowledgeEntries,
      mode: 'full',
      onStatus: undefined,
    });
    expect(result).toEqual({ ...analysisResult, knowledgeEntries });
  });

  it('handles knowledge as flat data array', async () => {
    const knowledgeEntries = [{ id: 'k1' }];
    mockFetchKnowledge.mockResolvedValue({ success: true, data: knowledgeEntries });
    mockRunAnalysis.mockResolvedValue({ summary: 'ok' });

    const result = await mod.enqueueAnalysis('art-1', makeArticle('art-1'));

    expect(result.knowledgeEntries).toEqual(knowledgeEntries);
  });

  it('proceeds with empty knowledge when fetchArticleKnowledge fails', async () => {
    mockFetchKnowledge.mockRejectedValue(new Error('API down'));
    mockRunAnalysis.mockResolvedValue({ summary: 'ok' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await mod.enqueueAnalysis('art-1', makeArticle('art-1'));

    expect(result.knowledgeEntries).toEqual([]);
    expect(mockRunAnalysis).toHaveBeenCalled();
  });

  it('de-duplicates: second call for running articleId resolves with same value', async () => {
    const d = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d.promise);

    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    // Wait for job to start executing
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalled());

    const p2 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));

    d.resolve({ summary: 'ok' });

    const [r1, r2] = await Promise.all([p1, p2]);
    // Both calls should resolve with the same result
    expect(r1.summary).toBe('ok');
    expect(r2.summary).toBe('ok');

    // runAnalysis should have only been called once (de-duplication)
    expect(mockRunAnalysis).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates: returns linked promise for queued articleId', async () => {
    // Make first job block so second job stays queued
    const d1 = deferred();
    const d2 = deferred();
    let callCount = 0;

    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? d1.promise : d2.promise;
    });

    // Enqueue first job (will start running)
    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(1));

    // Enqueue second job (will be queued)
    const p2 = mod.enqueueAnalysis('art-2', makeArticle('art-2'));

    // Enqueue duplicate of second job
    const p3 = mod.enqueueAnalysis('art-2', makeArticle('art-2'));

    // Resolve first job
    d1.resolve({ summary: 'first' });
    await p1;

    // Now art-2 starts
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(2));
    d2.resolve({ summary: 'second' });

    const [r2, r3] = await Promise.all([p2, p3]);
    expect(r2.summary).toBe('second');
    expect(r3.summary).toBe('second');
  });

  it('executes multiple different articleIds in FIFO order', async () => {
    const executionOrder = [];
    const deferreds = [deferred(), deferred(), deferred()];
    let callIdx = 0;

    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(({ article }) => {
      executionOrder.push(article.id);
      const d = deferreds[callIdx++];
      return d.promise;
    });

    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    const p2 = mod.enqueueAnalysis('art-2', makeArticle('art-2'));
    const p3 = mod.enqueueAnalysis('art-3', makeArticle('art-3'));

    // First job starts immediately
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(1));
    expect(executionOrder).toEqual(['art-1']);

    // Resolve first -> second starts
    deferreds[0].resolve({ summary: '1' });
    await p1;
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(2));
    expect(executionOrder).toEqual(['art-1', 'art-2']);

    // Resolve second -> third starts
    deferreds[1].resolve({ summary: '2' });
    await p2;
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(3));
    expect(executionOrder).toEqual(['art-1', 'art-2', 'art-3']);

    deferreds[2].resolve({ summary: '3' });
    await p3;
  });

  it('rejects when runAnalysis throws', async () => {
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockRejectedValue(new Error('inference failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(mod.enqueueAnalysis('art-1', makeArticle('art-1')))
      .rejects.toThrow('inference failed');
  });
});

// ══════════════════════════════════════════════
// 5. cancelAnalysis
// ══════════════════════════════════════════════

describe('cancelAnalysis', () => {
  it('cancels a queued (pending) job and rejects with AnalysisCancelledError', async () => {
    const d1 = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d1.promise);

    // First job starts running
    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(1));

    // Second job is queued
    const p2 = mod.enqueueAnalysis('art-2', makeArticle('art-2'));
    suppressRejection(p2);

    // Cancel the queued job
    mod.cancelAnalysis('art-2');

    await expect(p2).rejects.toThrow(mod.AnalysisCancelledError);

    // Verify it is removed from pending
    const status = mod.getQueueStatus();
    expect(status.pending).not.toContain('art-2');

    d1.resolve({ summary: 'ok' });
    await p1;
  });

  it('cancels a running job, rejects it, and advances to next', async () => {
    const d1 = deferred();
    const d2 = deferred();
    let callIdx = 0;

    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? d1.promise : d2.promise;
    });

    // p1 starts running
    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    suppressRejection(p1);
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(1));

    // p2 is queued
    const p2 = mod.enqueueAnalysis('art-2', makeArticle('art-2'));

    // Cancel the running job
    mod.cancelAnalysis('art-1');

    await expect(p1).rejects.toThrow(mod.AnalysisCancelledError);

    // art-2 should advance to running
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(2));

    d1.resolve({ summary: 'discarded' }); // should be discarded
    d2.resolve({ summary: 'second' });
    const r2 = await p2;
    expect(r2.summary).toBe('second');
  });

  it('does nothing when cancelling a non-existent articleId', () => {
    const statusBefore = mod.getQueueStatus();
    mod.cancelAnalysis('non-existent');
    const statusAfter = mod.getQueueStatus();

    expect(statusAfter).toEqual(statusBefore);
  });
});

// ══════════════════════════════════════════════
// 6. cancelAll
// ══════════════════════════════════════════════

describe('cancelAll', () => {
  it('cancels all queued and running jobs', async () => {
    const d1 = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d1.promise);

    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    suppressRejection(p1);
    await vi.waitFor(() => expect(mockRunAnalysis).toHaveBeenCalledTimes(1));

    const p2 = mod.enqueueAnalysis('art-2', makeArticle('art-2'));
    suppressRejection(p2);
    const p3 = mod.enqueueAnalysis('art-3', makeArticle('art-3'));
    suppressRejection(p3);

    mod.cancelAll();

    await expect(p1).rejects.toThrow(mod.AnalysisCancelledError);
    await expect(p2).rejects.toThrow(mod.AnalysisCancelledError);
    await expect(p3).rejects.toThrow(mod.AnalysisCancelledError);

    const status = mod.getQueueStatus();
    expect(status.currentJob).toBeNull();
    expect(status.pending).toEqual([]);

    d1.resolve({ summary: 'discarded' });
  });

  it('is a no-op when queue is already empty', () => {
    mod.cancelAll();
    const status = mod.getQueueStatus();
    expect(status).toEqual({ currentJob: null, pending: [] });
  });

  it('fires listener notification', async () => {
    const d1 = deferred();
    mockFetchKnowledge.mockResolvedValue({ success: true, data: [] });
    mockRunAnalysis.mockImplementation(() => d1.promise);

    const listener = vi.fn();
    mod.onQueueChange(listener);

    const p1 = mod.enqueueAnalysis('art-1', makeArticle('art-1'));
    suppressRejection(p1); // cancelAll will reject it
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    const countBefore = listener.mock.calls.length;
    mod.cancelAll();

    expect(listener.mock.calls.length).toBeGreaterThan(countBefore);

    d1.resolve({ summary: 'discarded' });
  });
});
