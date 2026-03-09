/**
 * PowerReader - Auto Runner
 *
 * Background analysis loop: fetches articles, filters already-processed,
 * shuffles randomly, enqueues to WebLLM, auto-submits results.
 *
 * Stops automatically on: 5 consecutive failures, 429 rate limit,
 * or user request.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { enqueueAnalysis, AnalysisCancelledError } from './queue.js';
import { fetchArticles, submitAnalysisResult } from '../api.js';
import { getAuthToken, getUserHash, isAuthenticated } from '../auth.js';
import { openDB } from '../db.js';
import { t } from '../../locale/zh-TW.js';

// ── Constants ──

const INTER_ANALYSIS_DELAY_MS = 2000;
const NETWORK_PAUSE_MS = 30000;
const MAX_CONSECUTIVE_FAILURES = 5;
const FETCH_BATCH_SIZE = 50;
const ANALYSIS_MODE_KEY = 'powerreader_analysis_mode';

// ── Module State ──

let _running = false;
let _stopping = false;
let _stats = { analyzed: 0, skipped: 0, failed: 0 };
let _currentArticle = null;
let _startedAt = null;
let _stopReason = null;
let _consecutiveFailures = 0;
let _abortController = null;
const _listeners = new Set();

// ── Event System ──

function _notify() {
  const status = getAutoRunnerStatus();
  for (const cb of _listeners) {
    try { cb(status); } catch (e) { console.error('[AutoRunner] Listener error:', e); }
  }
}

/**
 * Subscribe to auto-runner state changes. Returns unsubscribe function.
 * @param {Function} cb
 * @returns {Function} unsubscribe
 */
export function onAutoRunnerUpdate(cb) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

// ── Public API ──

/**
 * Get current auto-runner status (immutable snapshot).
 */
export function getAutoRunnerStatus() {
  return {
    running: _running,
    stopping: _stopping,
    analyzed: _stats.analyzed,
    failed: _stats.failed,
    skipped: _stats.skipped,
    currentArticle: _currentArticle
      ? { id: _currentArticle.article_id, title: _currentArticle.title }
      : null,
    startedAt: _startedAt,
    stopReason: _stopReason
  };
}

/**
 * Read current analysis mode from localStorage.
 * @returns {'auto' | 'manual'}
 */
export function isAutoModeEnabled() {
  return localStorage.getItem(ANALYSIS_MODE_KEY) === 'auto';
}

/**
 * Set analysis mode.
 * @param {'auto' | 'manual'} mode
 */
export function setAnalysisMode(mode) {
  localStorage.setItem(ANALYSIS_MODE_KEY, mode);
}

/**
 * Start auto-runner loop. Requires: logged in + model cached.
 */
export async function startAutoRunner() {
  if (_running) return;

  if (!isAuthenticated()) {
    _stopReason = t('auto_runner.error.not_logged_in');
    _notify();
    return;
  }

  if (localStorage.getItem('powerreader_webllm_cached') !== '1') {
    _stopReason = t('auto_runner.error.model_not_ready');
    _notify();
    return;
  }

  _running = true;
  _stopping = false;
  _stats = { analyzed: 0, skipped: 0, failed: 0 };
  _currentArticle = null;
  _startedAt = Date.now();
  _stopReason = null;
  _consecutiveFailures = 0;
  _abortController = new AbortController();
  _notify();

  try {
    await _runLoop();
  } finally {
    _running = false;
    _stopping = false;
    _currentArticle = null;
    _notify();
  }
}

/**
 * Graceful stop: finishes current analysis then stops.
 */
export function stopAutoRunner() {
  if (!_running || _stopping) return;
  _stopping = true;
  _stopReason = null;
  if (_abortController) _abortController.abort();
  _notify();
}

// ── Internal: Main Loop ──

async function _runLoop() {
  while (_running && !_stopping) {
    // Fetch a batch of articles
    const result = await fetchArticles({
      sort_by: 'published_at',
      limit: FETCH_BATCH_SIZE
    });

    if (!result.success || !result.data?.articles?.length) {
      _stopReason = t('auto_runner.error.no_articles');
      return;
    }

    const allArticles = result.data.articles;

    // Filter out already-processed articles via IndexedDB
    const processedIds = await _getProcessedIds();
    const candidates = allArticles.filter(a => !processedIds.has(a.article_id));

    if (candidates.length === 0) {
      _stopReason = t('auto_runner.error.no_articles');
      return;
    }

    // Fisher-Yates shuffle (creates its own copy internally)
    const shuffled = _fisherYatesShuffle(candidates);

    // Process each article
    for (const article of shuffled) {
      if (_stopping) return;

      _currentArticle = article;
      _notify();

      const status = await _processArticle(article);

      // Record to IndexedDB
      await _recordHistory(article.article_id, status.type, status.error);

      // Update stats and check stop conditions
      if (status.type === 'success') {
        _stats.analyzed += 1;
        _consecutiveFailures = 0;
      } else if (status.type === 'skipped_duplicate') {
        _stats.skipped += 1;
        _consecutiveFailures = 0;
      } else if (status.type === 'rate_limited') {
        _stopReason = t('auto_runner.error.rate_limited');
        _notify();
        return;
      } else {
        // failed_format, failed_network, failed_quality
        _stats.failed += 1;
        _consecutiveFailures += 1;

        if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          _stopReason = t('auto_runner.error.consecutive_failures', {
            count: String(_consecutiveFailures)
          });
          _notify();
          return;
        }

        // Network error: longer pause
        if (status.type === 'failed_network') {
          await _delay(NETWORK_PAUSE_MS);
          continue;
        }
      }

      _notify();

      // Inter-analysis delay
      await _delay(INTER_ANALYSIS_DELAY_MS);
    }

    // Batch exhausted — loop will fetch next batch
  }
}

// ── Internal: Process Single Article ──

async function _processArticle(article) {
  try {
    // Run analysis via queue
    const analysisResult = await enqueueAnalysis(article.article_id, article, {});

    // Build submission payload
    const payload = {
      bias_score: analysisResult.bias_score,
      controversy_score: analysisResult.controversy_score,
      reasoning: analysisResult.reasoning || '',
      key_phrases: analysisResult.key_phrases || [],
      narrative_points: analysisResult.points || [],
      prompt_version: analysisResult.prompt_version || 'v3.0.0',
      analysis_duration_ms: analysisResult.latency_ms || 0,
      inference_mode: analysisResult.mode || 'unknown',
      user_hash: getUserHash() || ''
    };

    // Validate basic format
    if (payload.bias_score == null || payload.controversy_score == null) {
      return { type: 'failed_format', error: 'Missing scores' };
    }

    if (typeof payload.bias_score !== 'number' || typeof payload.controversy_score !== 'number') {
      return { type: 'failed_format', error: 'Invalid score types' };
    }

    // Auto-submit to API
    const submitResult = await submitAnalysisResult(
      article.article_id,
      payload,
      getAuthToken() || ''
    );

    if (submitResult.success) {
      return { type: 'success', error: null };
    }

    // Classify server errors
    const errorStatus = submitResult.error?.status;
    const errorType = submitResult.error?.type;

    if (errorStatus === 409 || errorType === 'duplicate') {
      return { type: 'skipped_duplicate', error: null };
    }

    if (errorStatus === 429) {
      return { type: 'rate_limited', error: null };
    }

    if (errorType === 'quality_gate' || errorType === 'quality') {
      return { type: 'failed_quality', error: submitResult.error?.message || 'Quality gate' };
    }

    if (errorType === 'validation') {
      return { type: 'failed_format', error: submitResult.error?.message || 'Validation' };
    }

    return { type: 'failed_network', error: submitResult.error?.message || 'Unknown' };
  } catch (err) {
    if (err instanceof AnalysisCancelledError) {
      return { type: 'skipped_duplicate', error: null };
    }
    return { type: 'failed_network', error: err.message };
  }
}

// ── Internal: IndexedDB Helpers ──

async function _getProcessedIds() {
  try {
    const db = await openDB();
    const tx = db.transaction('auto_runner_history', 'readonly');
    const store = tx.objectStore('auto_runner_history');
    const req = store.getAllKeys();
    const keys = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return new Set(keys);
  } catch {
    return new Set();
  }
}

async function _recordHistory(articleId, status, errorMessage) {
  try {
    const db = await openDB();
    const tx = db.transaction('auto_runner_history', 'readwrite');
    tx.objectStore('auto_runner_history').put({
      article_id: articleId,
      status,
      analyzed_at: new Date().toISOString(),
      error_message: errorMessage || null
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[AutoRunner] Failed to record history:', e);
  }
}

// ── Internal: Utilities ──

/**
 * Fisher-Yates shuffle (returns new array, does not mutate input).
 * @param {Array} arr
 * @returns {Array}
 */
function _fisherYatesShuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Cancellable delay. Resolves early if abort signal fires.
 * @param {number} ms
 */
function _delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (_abortController) {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      _abortController.signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
