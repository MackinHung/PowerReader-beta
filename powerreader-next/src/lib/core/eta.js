/**
 * PowerReader - ETA Estimation Module
 *
 * Tracks inference latency per tier/pass and estimates remaining time.
 * Uses localStorage rolling window (last 10 entries per tier+pass).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

const LS_PREFIX = 'pr_eta_';
const WINDOW_SIZE = 10;

/**
 * Record a latency measurement.
 * @param {string} tier - 'gpu' | 'cpu'
 * @param {string} pass - 'pass1' | 'pass2'
 * @param {number} ms - Elapsed milliseconds
 */
export function recordLatency(tier, pass, ms) {
  const key = `${LS_PREFIX}${tier}_${pass}`;
  try {
    const raw = localStorage.getItem(key);
    const entries = raw ? JSON.parse(raw) : [];
    const updated = [...entries, ms].slice(-WINDOW_SIZE);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Estimate remaining time for a pass.
 * @param {string} tier
 * @param {string} pass
 * @param {number} elapsedMs - Time already spent
 * @returns {{ remainingMs: number, confidence: number } | null}
 */
export function estimateRemaining(tier, pass, elapsedMs) {
  const key = `${LS_PREFIX}${tier}_${pass}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entries = JSON.parse(raw);
    if (!entries.length) return null;

    const sorted = [...entries].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const remainingMs = Math.max(0, median - elapsedMs);
    const confidence = Math.min(0.95, 0.3 + (entries.length - 1) * 0.072);

    return { remainingMs, confidence };
  } catch {
    return null;
  }
}

/**
 * Get dual-pass progress as 0~1.
 * @param {string} stage
 * @param {number} elapsedMs
 * @param {string} tier - 'gpu' | 'cpu'
 * @returns {number}
 */
export function getDualPassProgress(stage, elapsedMs, tier) {
  if (stage === 'done' || stage === 'pass2_done') return 1;
  if (stage === 'preparing') return 0.02;
  if (stage === 'loading_model') return 0.07;
  if (stage === 'pass1_done') return 0.5;
  if (stage === 'fallback_to_server') return 0.5;

  if (stage === 'pass1_running') {
    const est = estimateRemaining(tier, 'pass1', 0);
    if (!est) return 0.3;
    const expected = est.remainingMs + elapsedMs;
    const fraction = Math.min(1, elapsedMs / (expected || 1));
    return 0.1 + fraction * 0.4;
  }

  if (stage === 'pass2_running') {
    const est = estimateRemaining(tier, 'pass2', 0);
    if (!est) return 0.7;
    const expected = est.remainingMs + elapsedMs;
    const fraction = Math.min(1, elapsedMs / (expected || 1));
    return 0.5 + fraction * 0.45;
  }

  if (stage === 'running' || stage === 'generating') return 0.5;
  return 0;
}
