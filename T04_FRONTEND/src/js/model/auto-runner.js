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

import { enqueueAnalysis, cancelAll, AnalysisCancelledError } from './queue.js';
import { fetchArticles, submitAnalysisResult } from '../api.js';
import { getAuthToken, getUserHash, isAuthenticated } from '../auth.js';
import { openDB } from '../db.js';
import { t } from '../../locale/zh-TW.js';
import { createEventEmitter } from '../utils/event-emitter.js';
import { promisifyRequest, promisifyTransaction } from '../utils/idb-helpers.js';
import { isMobileDevice } from '../utils/device-detect.js';
import { scanGPU } from './benchmark.js';

// ── Constants ──

const INTER_ANALYSIS_DELAY_MS = 2000;
const NETWORK_PAUSE_MS = 30000;
const MAX_CONSECUTIVE_FAILURES = 5;
const FETCH_BATCH_SIZE = 50;
const ANALYSIS_MODE_KEY = 'powerreader_analysis_mode';

// ── Module State ──

let _running = false;
let _paused = false;
let _stats = { analyzed: 0, skipped: 0, failed: 0 };
let _currentArticle = null;
let _startedAt = null;
let _stopReason = null;
let _consecutiveFailures = 0;
let _abortController = null;
let _resumeResolver = null;
const _emitter = createEventEmitter('AutoRunner');

// ── Event System ──

function _notify() {
  _emitter.notify(getAutoRunnerStatus());
}

/**
 * Subscribe to auto-runner state changes. Returns unsubscribe function.
 * @param {Function} cb
 * @returns {Function} unsubscribe
 */
export function onAutoRunnerUpdate(cb) {
  return _emitter.subscribe(cb);
}

// ── Public API ──

/**
 * Get current auto-runner status (immutable snapshot).
 */
export function getAutoRunnerStatus() {
  return {
    running: _running,
    paused: _paused,
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

  if (isMobileDevice()) {
    _stopReason = t('auto_runner.error.mobile_blocked');
    _notify();
    return;
  }

  // GPU capability gate
  const gpuInfo = await scanGPU();
  if (!gpuInfo.supported) {
    _stopReason = t('auto_analysis.error.no_webgpu');
    _notify();
    return;
  }

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
  _paused = false;
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
    _paused = false;
    _currentArticle = null;
    _resumeResolver = null;
    _notify();
  }
}

/**
 * Smart toggle: running → pause; paused → force stop.
 */
export function stopAutoRunner() {
  if (!_running) return;

  if (_paused) {
    forceStopAutoRunner();
  } else {
    pauseAutoRunner();
  }
}

/**
 * Pause auto-runner. Current analysis finishes, then loop suspends.
 */
export function pauseAutoRunner() {
  if (!_running || _paused) return;
  _paused = true;
  _stopReason = null;
  if (_abortController) _abortController.abort();
  _notify();
}

/**
 * Resume auto-runner from paused state.
 */
export function resumeAutoRunner() {
  if (!_running || !_paused) return;
  _paused = false;
  _abortController = new AbortController();
  if (_resumeResolver) {
    _resumeResolver();
    _resumeResolver = null;
  }
  _notify();
}

/**
 * Force stop: cancel all running/queued analyses and exit.
 */
export function forceStopAutoRunner() {
  if (!_running) return;
  cancelAll();
  _running = false;
  _paused = false;
  if (_resumeResolver) {
    _resumeResolver();
    _resumeResolver = null;
  }
  _notify();
}

// ── Internal: Main Loop ──

async function _runLoop() {
  while (_running) {
    // Check for pause between batches
    if (_paused) {
      await _waitForResume();
      if (!_running) return;
    }

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
      // Check for pause between articles
      if (_paused) {
        _currentArticle = null;
        _notify();
        await _waitForResume();
        if (!_running) return;
      }

      _currentArticle = article;
      _notify();

      const status = await _processArticle(article);

      if (!_running) return;

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

/**
 * Suspend loop until resume or force-stop.
 */
function _waitForResume() {
  return new Promise((resolve) => {
    _resumeResolver = resolve;
  });
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
    const keys = await promisifyRequest(tx.objectStore('auto_runner_history').getAllKeys());
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
    await promisifyTransaction(tx);
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
