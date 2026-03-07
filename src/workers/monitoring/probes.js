/**
 * Monitoring Probes Module (T07)
 *
 * Provides health check probe functions for all Cloudflare service bindings.
 * T01 calls these from the /health/ready handler.
 *
 * Navigation:
 * - Upstream: T07/MONITORING_DASHBOARD.md, shared/config.js
 * - Downstream: src/workers/handlers/health.js (T01 integration)
 * - Maintainer: T07 (Deployment & Monitoring Team)
 */

import { MODELS } from '../../../shared/config.js';

// --- Individual Probe Functions ---

/**
 * Probe D1 database connectivity.
 * Runs `SELECT 1 AS ok` to verify the binding is alive.
 * @param {object} env - Workers env bindings
 * @returns {Promise<{status: 'ok'|'error', latency_ms: number, message?: string}>}
 */
export async function probeD1(env) {
  const start = performance.now();
  try {
    const result = await env.DB.prepare('SELECT 1 AS ok').first();
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    if (result && result.ok === 1) {
      return { status: 'ok', latency_ms };
    }
    return { status: 'error', latency_ms, message: 'Unexpected query result' };
  } catch (err) {
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'error', latency_ms, message: err.message };
  }
}

/**
 * Probe R2 bucket connectivity.
 * Uses HEAD on a non-existent key; R2 returns null (not error) for missing keys.
 * @param {object} env - Workers env bindings
 * @returns {Promise<{status: 'ok'|'error', latency_ms: number, message?: string}>}
 */
export async function probeR2(env) {
  const start = performance.now();
  try {
    await env.ARTICLES.head('health-check');
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'ok', latency_ms };
  } catch (err) {
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'error', latency_ms, message: err.message };
  }
}

/**
 * Probe Vectorize index connectivity.
 * Calls describe() to verify the index exists. Binding is optional.
 * @param {object} env - Workers env bindings
 * @returns {Promise<{status: 'ok'|'error', latency_ms: number, message?: string}>}
 */
export async function probeVectorize(env) {
  if (!env.KNOWLEDGE_INDEX) {
    return { status: 'ok', latency_ms: 0, message: 'Vectorize not bound' };
  }
  const start = performance.now();
  try {
    await env.KNOWLEDGE_INDEX.describe();
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'ok', latency_ms };
  } catch (err) {
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'error', latency_ms, message: err.message };
  }
}

/**
 * Probe KV namespace connectivity.
 * Performs a read-only GET on a sentinel key (no writes).
 * @param {object} env - Workers env bindings
 * @returns {Promise<{status: 'ok'|'error', latency_ms: number, message?: string}>}
 */
export async function probeKV(env) {
  const start = performance.now();
  try {
    await env.KV.get('health:ping');
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'ok', latency_ms };
  } catch (err) {
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'error', latency_ms, message: err.message };
  }
}

/**
 * Probe Workers AI — skipped by default to conserve neurons.
 * @param {object} _env - Workers env bindings (unused)
 * @returns {Promise<{status: 'ok', latency_ms: number, message: string}>}
 */
export async function probeWorkersAI(_env) {
  return { status: 'ok', latency_ms: 0, message: 'Skipped (neuron cost)' };
}

/**
 * Probe Workers AI with an actual embedding call.
 * Only call this explicitly when a full AI health check is needed.
 * @param {object} env - Workers env bindings
 * @returns {Promise<{status: 'ok'|'error', latency_ms: number, message?: string}>}
 */
export async function probeWorkersAIFull(env) {
  const start = performance.now();
  try {
    const result = await env.AI.run(MODELS.EMBEDDING, {
      text: ['health check'],
    });
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    if (result && result.data && result.data.length > 0) {
      return { status: 'ok', latency_ms };
    }
    return { status: 'error', latency_ms, message: 'Empty embedding result' };
  } catch (err) {
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;
    return { status: 'error', latency_ms, message: err.message };
  }
}

// --- Aggregate Runner ---

/**
 * Run all probes and return combined result.
 * @param {object} env - Workers env bindings
 * @param {object} options - { includeAI: false }
 * @returns {Promise<{checks: Record<string, {status: 'ok'|'error', latency_ms: number, message?: string}>, allOk: boolean}>}
 */
export async function runAllProbes(env, options = {}) {
  const { includeAI = false } = options;

  const aiProbe = includeAI ? probeWorkersAIFull : probeWorkersAI;

  const [d1, r2, vectorize, kv, ai] = await Promise.all([
    probeD1(env),
    probeR2(env),
    probeVectorize(env),
    probeKV(env),
    aiProbe(env),
  ]);

  const checks = { d1, r2, vectorize, kv, ai };

  const allOk = Object.values(checks).every(
    (probe) => probe.status === 'ok'
  );

  return { checks, allOk };
}
