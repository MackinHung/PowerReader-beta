/**
 * Pre-deploy Config Validation
 * Validates shared/config.js structural integrity and value constraints.
 *
 * Usage: node scripts/validate-config.js
 * Exit code: 0 = pass, 1 = fail
 *
 * Navigation:
 * - Upstream: .github/workflows/deploy.yml (line 38), package.json (validate script)
 * - Config:   shared/config.js (SSOT)
 * - Maintainer: T07 (Deployment & Monitoring Team)
 */

import {
  MODELS, CLOUDFLARE, KV_WRITE_BUDGET, CRAWLER,
  ANALYSIS, REWARD, FRONTEND, SECURITY, MONITORING,
  LOCALIZATION, DEV,
} from '../shared/config.js';

const errors = [];

function check(condition, message) {
  if (!condition) {
    errors.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function isPositiveNumber(v) {
  return typeof v === 'number' && !Number.isNaN(v) && v > 0;
}

function isSortedAscending(arr) {
  return arr.every((v, i) => i === 0 || v > arr[i - 1]);
}

// --- Top-level exports existence ---
const sections = { MODELS, CLOUDFLARE, KV_WRITE_BUDGET, CRAWLER, ANALYSIS, REWARD, FRONTEND, SECURITY, MONITORING, LOCALIZATION, DEV };
for (const [name, val] of Object.entries(sections)) {
  check(val != null && typeof val === 'object', `Top-level export "${name}" exists and is an object`);
}

// --- MODELS ---
check(typeof MODELS.EMBEDDING === 'string' && MODELS.EMBEDDING.length > 0, 'MODELS.EMBEDDING is a non-empty string');
check(typeof MODELS.QWEN === 'string' && MODELS.QWEN.length > 0, 'MODELS.QWEN is a non-empty string');
check(isPositiveNumber(MODELS.EMBEDDING_DIMENSIONS), 'MODELS.EMBEDDING_DIMENSIONS is a positive number');
check(isPositiveNumber(MODELS.QWEN_SIZE_MB), 'MODELS.QWEN_SIZE_MB is a positive number');
check(isPositiveNumber(MODELS.QWEN_TIMEOUT_MS), 'MODELS.QWEN_TIMEOUT_MS is a positive number');

// --- CLOUDFLARE limits all > 0 ---
const cfNumericKeys = [
  'KV_DAILY_WRITE_LIMIT', 'KV_MONTHLY_WRITE_LIMIT', 'KV_DAILY_READ_LIMIT',
  'WORKERS_AI_DAILY_LIMIT', 'WORKERS_AI_DAILY_NEURON_BUDGET',
  'VECTORIZE_MONTHLY_QUERY_DIM_LIMIT', 'R2_MAX_STORAGE_GB',
  'D1_MAX_STORAGE_GB', 'D1_DAILY_READ_LIMIT', 'WORKERS_DAILY_REQUEST_LIMIT',
];
for (const key of cfNumericKeys) {
  check(isPositiveNumber(CLOUDFLARE[key]), `CLOUDFLARE.${key} > 0 (got: ${CLOUDFLARE[key]})`);
}

// --- KV_WRITE_BUDGET total = CLOUDFLARE.KV_DAILY_WRITE_LIMIT ---
const kvTotal = Object.values(KV_WRITE_BUDGET).reduce((a, b) => a + b, 0);
check(kvTotal === CLOUDFLARE.KV_DAILY_WRITE_LIMIT,
  `KV_WRITE_BUDGET total (${kvTotal}) = KV_DAILY_WRITE_LIMIT (${CLOUDFLARE.KV_DAILY_WRITE_LIMIT})`);
for (const [team, val] of Object.entries(KV_WRITE_BUDGET)) {
  check(isPositiveNumber(val), `KV_WRITE_BUDGET.${team} is a positive number`);
}

// --- CRAWLER ---
check(CRAWLER.RATE_LIMIT_DELAY_MS >= 2000,
  `CRAWLER.RATE_LIMIT_DELAY_MS >= 2000 (compliance, got: ${CRAWLER.RATE_LIMIT_DELAY_MS})`);
check(CRAWLER.MAX_ARTICLES_PER_RUN <= 100,
  `CRAWLER.MAX_ARTICLES_PER_RUN <= 100 (got: ${CRAWLER.MAX_ARTICLES_PER_RUN})`);
check(isPositiveNumber(CRAWLER.MAX_ARTICLES_PER_RUN), 'CRAWLER.MAX_ARTICLES_PER_RUN > 0');
check(isPositiveNumber(CRAWLER.MAX_RETRIES), 'CRAWLER.MAX_RETRIES > 0');
check(isPositiveNumber(CRAWLER.RETRY_DELAY_MS), 'CRAWLER.RETRY_DELAY_MS > 0');

// --- ANALYSIS.BIAS_BOUNDARIES ---
check(Array.isArray(ANALYSIS.BIAS_BOUNDARIES) && ANALYSIS.BIAS_BOUNDARIES.length === 6,
  `ANALYSIS.BIAS_BOUNDARIES is an array of 6 (got: ${ANALYSIS.BIAS_BOUNDARIES?.length})`);
check(ANALYSIS.BIAS_BOUNDARIES.every(v => typeof v === 'number'),
  'ANALYSIS.BIAS_BOUNDARIES contains only numbers');
check(isSortedAscending(ANALYSIS.BIAS_BOUNDARIES),
  'ANALYSIS.BIAS_BOUNDARIES is sorted ascending');

// --- ANALYSIS.CONTROVERSY_BOUNDARIES ---
check(Array.isArray(ANALYSIS.CONTROVERSY_BOUNDARIES) && ANALYSIS.CONTROVERSY_BOUNDARIES.length === 3,
  `ANALYSIS.CONTROVERSY_BOUNDARIES is an array of 3 (got: ${ANALYSIS.CONTROVERSY_BOUNDARIES?.length})`);
check(ANALYSIS.CONTROVERSY_BOUNDARIES.every(v => typeof v === 'number'),
  'ANALYSIS.CONTROVERSY_BOUNDARIES contains only numbers');
check(isSortedAscending(ANALYSIS.CONTROVERSY_BOUNDARIES),
  'ANALYSIS.CONTROVERSY_BOUNDARIES is sorted ascending');

// --- ANALYSIS numeric fields ---
check(isPositiveNumber(ANALYSIS.MIN_ARTICLE_CHARS), 'ANALYSIS.MIN_ARTICLE_CHARS > 0');
check(ANALYSIS.SIMILARITY_DUPLICATE_THRESHOLD > ANALYSIS.SIMILARITY_REWRITE_THRESHOLD,
  'ANALYSIS duplicate threshold > rewrite threshold');

// --- REWARD ---
check(isPositiveNumber(REWARD.POINTS_PER_VALID_ANALYSIS), 'REWARD.POINTS_PER_VALID_ANALYSIS > 0');
check(isPositiveNumber(REWARD.DAILY_ANALYSIS_LIMIT), 'REWARD.DAILY_ANALYSIS_LIMIT > 0');
check(isPositiveNumber(REWARD.MIN_ANALYSIS_TIME_MS), 'REWARD.MIN_ANALYSIS_TIME_MS > 0');

// --- SECURITY ---
check(SECURITY.ESCAPE_HTML === true, 'SECURITY.ESCAPE_HTML is enabled');
check(SECURITY.SESSION_CROSS_VERIFY === true, 'SECURITY.SESSION_CROSS_VERIFY is enabled');
check(isPositiveNumber(SECURITY.API_RATE_LIMIT_PER_MINUTE), 'SECURITY.API_RATE_LIMIT_PER_MINUTE > 0');
check(isPositiveNumber(SECURITY.API_RATE_LIMIT_PER_HOUR), 'SECURITY.API_RATE_LIMIT_PER_HOUR > 0');

// --- MONITORING alert thresholds ---
const pctThresholds = [
  'TARGET_CDN_CACHE_HIT_RATE', 'ALERT_CDN_HIT_RATE_THRESHOLD',
  'ALERT_CRAWLER_FAILURE_THRESHOLD', 'ALERT_ANALYSIS_FAILURE_THRESHOLD',
  'ALERT_KV_WRITES_PCT', 'ALERT_WORKERS_AI_NEURONS_PCT',
  'ALERT_WORKERS_REQUESTS_PCT', 'ALERT_VECTORIZE_QUERIES_PCT',
  'ALERT_R2_STORAGE_PCT', 'ALERT_D1_STORAGE_PCT',
];
for (const key of pctThresholds) {
  const v = MONITORING[key];
  check(typeof v === 'number' && v > 0 && v <= 1,
    `MONITORING.${key} is between 0 and 1 (got: ${v})`);
}
const msThresholds = ['TARGET_KV_LATENCY_MS', 'ALERT_KV_LATENCY_MS', 'DASHBOARD_REFRESH_INTERVAL_SEC', 'TARGET_MODEL_INFERENCE_SEC'];
for (const key of msThresholds) {
  check(isPositiveNumber(MONITORING[key]), `MONITORING.${key} > 0 (got: ${MONITORING[key]})`);
}

// --- Cross-check: Vectorize dimensions = Embedding dimensions ---
check(CLOUDFLARE.VECTORIZE_DIMENSIONS === MODELS.EMBEDDING_DIMENSIONS,
  `VECTORIZE_DIMENSIONS (${CLOUDFLARE.VECTORIZE_DIMENSIONS}) matches EMBEDDING_DIMENSIONS (${MODELS.EMBEDDING_DIMENSIONS})`);

// === Result ===
console.log('');
if (errors.length > 0) {
  console.error(`Config validation FAILED with ${errors.length} error(s)`);
  process.exit(1);
} else {
  console.log('✅ Config validation passed');
  process.exit(0);
}
