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
import { fetchArticles, fetchArticle, fetchEvents, searchArticles, submitAnalysisResult, fetchUserPoints } from './api.js';
import { getAuthToken, getUserHash, isAuthenticated } from './auth.js';
import { openDB } from './db.js';
import { t } from '$lib/i18n/zh-TW.js';
import { createEventEmitter } from '$lib/utils/event-emitter.js';
import { promisifyRequest, promisifyTransaction } from '$lib/utils/idb-helpers.js';
import { isMobileDevice } from '$lib/utils/device-detect.js';
import { scanGPU, getCachedBenchmark } from './benchmark.js';
import type { Article } from '$lib/types/models.js';
import type { AutoRunnerStatus, AutoRunnerStats } from '$lib/types/inference.js';

// ── Constants ──

function getInterAnalysisDelay(): number {
  const benchmark = getCachedBenchmark();
  if (benchmark?.mode === 'gpu') return 1000;
  if (benchmark?.mode === 'cpu') return 3000;
  return 5000;
}
const NETWORK_PAUSE_MS = 30000;
const MAX_CONSECUTIVE_FAILURES = 5;
const FETCH_BATCH_SIZE = 50;
const ANALYSIS_MODE_KEY = 'powerreader_analysis_mode';

// ── Module State ──

let _running = false;
let _paused = false;
let _stats: AutoRunnerStats = { analyzed: 0, skipped: 0, failed: 0 };
let _currentArticle: Article | null = null;
let _startedAt: number | null = null;
let _stopReason: string | null = null;
let _consecutiveFailures = 0;
let _abortController: AbortController | null = null;
let _resumeResolver: (() => void) | null = null;
const _emitter = createEventEmitter<AutoRunnerStatus>('AutoRunner');

// ── Event System ──

function _notify(): void {
  _emitter.notify(getAutoRunnerStatus());
}

/**
 * Subscribe to auto-runner state changes. Returns unsubscribe function.
 */
export function onAutoRunnerUpdate(cb: (status: AutoRunnerStatus) => void): () => void {
  return _emitter.subscribe(cb);
}

// ── Public API ──

/**
 * Get current auto-runner status (immutable snapshot).
 */
export function getAutoRunnerStatus(): AutoRunnerStatus {
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
 */
export function isAutoModeEnabled(): boolean {
  return localStorage.getItem(ANALYSIS_MODE_KEY) === 'auto';
}

/**
 * Set analysis mode.
 */
export function setAnalysisMode(mode: string): void {
  localStorage.setItem(ANALYSIS_MODE_KEY, mode);
}

/**
 * Start auto-runner loop. Requires: logged in + model cached.
 */
export async function startAutoRunner(): Promise<void> {
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

  // Note: daily points limit no longer blocks analysis.
  // Users can always analyze; they just stop earning points after hitting the limit.

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
 * Smart toggle: running -> pause; paused -> force stop.
 */
export function stopAutoRunner(): void {
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
export function pauseAutoRunner(): void {
  if (!_running || _paused) return;
  _paused = true;
  _stopReason = null;
  if (_abortController) _abortController.abort();
  _notify();
}

/**
 * Resume auto-runner from paused state.
 */
export function resumeAutoRunner(): void {
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
export function forceStopAutoRunner(): void {
  if (!_running) return;
  cancelAll();
  _running = false;
  _paused = false;
  // Abort any pending delays so loop exits immediately
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
  if (_resumeResolver) {
    _resumeResolver();
    _resumeResolver = null;
  }
  _notify();
}

// ── Internal: Main Loop ──

interface ProcessStatus {
  type: 'success' | 'skipped_duplicate' | 'rate_limited' | 'failed_network' | 'failed_format' | 'failed_quality';
  error: string | null;
}

async function _runLoop(): Promise<void> {
  while (_running) {
    if (_paused) {
      await _waitForResume();
      if (!_running) return;
    }

    // ── Cluster-priority: fetch events first, then fallback to flat articles ──
    const articles = await _fetchClusterPrioritizedArticles();

    if (!_running) return;

    if (articles.length === 0) {
      _stopReason = t('auto_runner.error.no_articles');
      return;
    }

    // Process each article (already ordered by cluster)
    for (const article of articles) {
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

      await _recordHistory(article.article_id, status.type, status.error);

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
        _stats.failed += 1;
        _consecutiveFailures += 1;

        if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          _stopReason = t('auto_runner.error.consecutive_failures', {
            count: String(_consecutiveFailures)
          });
          _notify();
          return;
        }

        if (status.type === 'failed_network') {
          await _delay(NETWORK_PAUSE_MS);
          continue;
        }
      }

      _notify();
      await _delay(getInterAnalysisDelay());
    }

    // Batch exhausted — loop will fetch next batch
  }
}

/**
 * Fetch articles ordered by event cluster priority:
 * 1. Fetch events -> for each event, search for its articles
 * 2. Group articles by cluster (same event together)
 * 3. Fallback to flat article list if no events available
 * 4. Filter out already-processed articles
 */
async function _fetchClusterPrioritizedArticles(): Promise<Article[]> {
  const processedIds = await _getProcessedIds();

  // Try cluster-first approach
  try {
    const eventsResult = await fetchEvents({ page: 1, limit: 20 });
    const events = eventsResult.success
      ? (eventsResult.data?.items || (eventsResult.data as any)?.events || [])
      : [];

    if (events.length > 0) {
      const clusteredArticles: Article[] = [];
      const seenIds = new Set<string>();

      for (const event of events) {
        if (!_running) return [];

        // Search for articles related to this event
        const shortTitle = (event.title || '').slice(0, 15);
        if (!shortTitle) continue;

        try {
          const searchResult = await searchArticles(shortTitle, { limit: 10 });
          const articles: Article[] = searchResult.success
            ? (searchResult.data?.articles || (searchResult.data as any)?.items || [])
            : [];

          for (const article of articles) {
            if (!seenIds.has(article.article_id)) {
              seenIds.add(article.article_id);
              clusteredArticles.push(article);
            }
          }
        } catch {
          // Skip this cluster on error, continue to next
        }
      }

      // Filter out already-processed
      const candidates = clusteredArticles.filter(a =>
        !((a as any).analysis_count > 0) && !processedIds.has(a.article_id)
      );

      if (candidates.length > 0) return candidates;
    }
  } catch {
    // Fall through to flat fallback
  }

  // Fallback: flat article list (shuffled)
  const result = await fetchArticles({
    sort_by: 'published_at',
    limit: FETCH_BATCH_SIZE
  });

  if (!result.success || !(result.data as any)?.articles?.length) return [];

  const candidates = (result.data as any).articles.filter((a: any) =>
    !(a.analysis_count > 0) && !processedIds.has(a.article_id)
  ) as Article[];

  return _fisherYatesShuffle(candidates);
}

/**
 * Suspend loop until resume or force-stop.
 */
function _waitForResume(): Promise<void> {
  return new Promise((resolve) => {
    _resumeResolver = resolve;
  });
}

// ── Internal: Process Single Article ──

async function _processArticle(article: Article): Promise<ProcessStatus> {
  try {
    // Fresh duplicate check — avoid wasting GPU time if someone else already analyzed
    try {
      const freshCheck = await fetchArticle(article.article_id);
      if (freshCheck.success && (freshCheck.data as any)?.analysis_count > 0) {
        return { type: 'skipped_duplicate', error: null };
      }
    } catch {
      // If check fails, proceed anyway — server will reject duplicates on submit
    }

    // Run analysis via queue
    const analysisResult = await enqueueAnalysis(article.article_id, article, {});

    // Build submission payload
    const payload = {
      bias_score: analysisResult.bias_score,
      controversy_score: analysisResult.controversy_score,
      is_political: analysisResult.is_political ?? true,
      emotion_intensity: analysisResult.emotion_intensity ?? 50,
      reasoning: analysisResult.reasoning || '',
      key_phrases: analysisResult.key_phrases || [],
      narrative_points: analysisResult.points || [],
      prompt_version: analysisResult.prompt_version || 'v4.0.0',
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
      payload as any,
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
    return { type: 'failed_network', error: (err as Error).message };
  }
}

// ── Internal: IndexedDB Helpers ──

async function _getProcessedIds(): Promise<Set<string>> {
  try {
    const db = await openDB();
    const tx = db.transaction('auto_runner_history', 'readonly');
    const keys = await promisifyRequest(tx.objectStore('auto_runner_history').getAllKeys()) as unknown as string[];
    db.close();
    return new Set(keys);
  } catch {
    return new Set();
  }
}

async function _recordHistory(articleId: string, status: string, errorMessage: string | null): Promise<void> {
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
 */
function _fisherYatesShuffle<T>(arr: T[]): T[] {
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
 */
function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (_abortController) {
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      _abortController.signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
