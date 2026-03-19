/**
 * PowerReader - Analysis Queue Manager
 *
 * Singleton FIFO queue for WebLLM inference engine.
 * Only one analysis runs at a time; others wait in order.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { runAnalysis, interruptInference } from './inference.js';
import { fetchArticleKnowledge } from './api.js';
import { createEventEmitter } from '$lib/utils/event-emitter.js';
import type { Article, AnalysisResult, KnowledgeEntry } from '$lib/types/models.js';
import type { AnalysisOptions, QueueStatus } from '$lib/types/inference.js';

interface ActiveJob {
  articleId: string;
  startedAt: number;
  promise: Promise<AnalysisResult>;
  resolve: (value: AnalysisResult) => void;
  reject: (reason: unknown) => void;
  abortController: AbortController;
}

interface PendingJob {
  articleId: string;
  article: Article;
  options: AnalysisOptions;
  resolve: (value: AnalysisResult) => void;
  reject: (reason: unknown) => void;
}

export class AnalysisCancelledError extends Error {
  articleId: string;

  constructor(articleId: string) {
    super(`Analysis cancelled: ${articleId}`);
    this.name = 'AnalysisCancelledError';
    this.articleId = articleId;
  }
}

// ── Queue State (module-level singleton) ──

let _currentJob: ActiveJob | null = null;
let _pendingQueue: PendingJob[] = [];
let _cancelledIds: Set<string> = new Set();
const _emitter = createEventEmitter<QueueStatus>('Queue');

// ── Event System ──

function _notifyListeners(): void {
  _emitter.notify(getQueueStatus());
}

/** Subscribe to queue state changes. Returns unsubscribe function. */
export function onQueueChange(callback: (status: QueueStatus) => void): () => void {
  return _emitter.subscribe(callback);
}

// ── Queue Status ──

/** Get current queue status (immutable snapshot). */
export function getQueueStatus(): QueueStatus {
  return {
    currentJob: _currentJob
      ? { articleId: _currentJob.articleId, startedAt: _currentJob.startedAt }
      : null,
    pending: _pendingQueue.map(j => j.articleId)
  };
}

// ── Enqueue ──

/**
 * Enqueue an analysis job. Returns a promise that resolves with the result.
 * 同一 articleId 已在執行或排隊中，回傳既有 promise (去重)
 */
export function enqueueAnalysis(articleId: string, article: Article, options: AnalysisOptions = {}): Promise<AnalysisResult> {
  // 去重：正在執行的 job
  if (_currentJob && _currentJob.articleId === articleId) {
    return _currentJob.promise;
  }

  // 去重：已在排隊中
  const existing = _pendingQueue.find(j => j.articleId === articleId);
  if (existing) {
    return new Promise<AnalysisResult>((resolve, reject) => {
      const origResolve = existing.resolve;
      const origReject = existing.reject;
      existing.resolve = (val: AnalysisResult) => { origResolve(val); resolve(val); };
      existing.reject = (err: unknown) => { origReject(err); reject(err); };
    });
  }

  // 建立新 job
  return new Promise<AnalysisResult>((resolve, reject) => {
    _pendingQueue = [..._pendingQueue, { articleId, article, options, resolve, reject }];
    _notifyListeners();
    _tryAdvance();
  });
}

// ── Cancel ──

/** Cancel a specific analysis by articleId. */
export function cancelAnalysis(articleId: string): void {
  // 從排隊中移除
  const idx = _pendingQueue.findIndex(j => j.articleId === articleId);
  if (idx !== -1) {
    const job = _pendingQueue[idx];
    _pendingQueue = [..._pendingQueue.slice(0, idx), ..._pendingQueue.slice(idx + 1)];
    job.reject(new AnalysisCancelledError(articleId));
    _notifyListeners();
    return;
  }

  // 正在執行中：標記取消，結果會被丟棄
  if (_currentJob && _currentJob.articleId === articleId) {
    interruptInference();  // Stop GPU computation immediately
    if (_currentJob.abortController) _currentJob.abortController.abort();
    _cancelledIds = new Set([..._cancelledIds, articleId]);
    _currentJob.reject(new AnalysisCancelledError(articleId));
    _currentJob = null;
    _notifyListeners();
    _tryAdvance();
  }
}

/** Cancel all pending and running analyses. */
export function cancelAll(): void {
  const pending = _pendingQueue;
  _pendingQueue = [];

  for (const job of pending) {
    job.reject(new AnalysisCancelledError(job.articleId));
  }

  if (_currentJob) {
    interruptInference();  // Stop GPU computation immediately
    if (_currentJob.abortController) _currentJob.abortController.abort();
    _cancelledIds = new Set([..._cancelledIds, _currentJob.articleId]);
    _currentJob.reject(new AnalysisCancelledError(_currentJob.articleId));
    _currentJob = null;
  }

  _notifyListeners();
}

// ── Internal: Job Runner ──

/** 嘗試啟動下一個排隊中的 job */
function _tryAdvance(): void {
  if (_currentJob || _pendingQueue.length === 0) return;

  const [next, ...rest] = _pendingQueue;
  _pendingQueue = rest;

  const { articleId, article, options, resolve, reject } = next;
  const abortController = new AbortController();
  const promise = _executeJob(articleId, article, options, abortController.signal);

  _currentJob = { articleId, startedAt: Date.now(), promise, resolve, reject, abortController };
  _notifyListeners();

  promise
    .then((result) => {
      if (_cancelledIds.has(articleId)) {
        _cancelledIds = new Set([..._cancelledIds].filter(id => id !== articleId));
        return; // reject 已在 cancelAnalysis 中呼叫
      }
      resolve(result);
    })
    .catch((err) => {
      if (_cancelledIds.has(articleId)) {
        _cancelledIds = new Set([..._cancelledIds].filter(id => id !== articleId));
        return;
      }
      console.error(`[Queue] Analysis failed for ${articleId}:`, err);
      reject(err);
    })
    .finally(() => {
      if (_currentJob && _currentJob.articleId === articleId) {
        _currentJob = null;
      }
      _notifyListeners();
      _tryAdvance();
    });
}

/** 執行完整分析管線：取得知識 → 推理 */
async function _executeJob(articleId: string, article: Article, options: AnalysisOptions, signal: AbortSignal): Promise<AnalysisResult> {
  // 取得 RAG 知識條目（失敗時降級為空陣列）
  let knowledgeEntries: KnowledgeEntry[] = [];
  try {
    const res = await fetchArticleKnowledge(articleId);
    if (res.success && Array.isArray(res.data?.knowledge_entries)) {
      knowledgeEntries = res.data.knowledge_entries;
    } else if (res.success && Array.isArray(res.data)) {
      knowledgeEntries = res.data as unknown as KnowledgeEntry[];
    }
  } catch (e) {
    console.warn('[Queue] Knowledge fetch failed, proceeding without:', e);
  }

  const result = await runAnalysis({
    article,
    knowledgeEntries,
    mode: options.mode,
    onStatus: options.onStatus,
    signal
  });

  return { ...result, knowledgeEntries };
}
