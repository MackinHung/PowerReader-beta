/**
 * PowerReader - Event Detail Page Helpers
 *
 * Pure functions for event detail page logic.
 * Extracted for testability (TDD) before wiring into the Svelte page.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

const PRODUCTION_URL = 'https://powerreader.pages.dev';

// ── Analysis State ──

/**
 * Determine the analysis state of a cluster.
 * @param {Object|null} cluster
 * @returns {'none' | 'partial' | 'complete'}
 */
export function getAnalysisState(cluster) {
  if (!cluster) return 'none';
  const analyzed = cluster.analyzed_count ?? 0;
  const total = cluster.article_count ?? 0;
  if (analyzed <= 0 || total <= 0) return 'none';
  if (analyzed >= total) return 'complete';
  return 'partial';
}

/**
 * Get analysis progress info.
 * @param {Object|null} cluster
 * @param {Array} articles - fallback for total count
 * @returns {{ analyzed: number, total: number, percentage: number }}
 */
export function getAnalysisProgress(cluster, articles = []) {
  if (!cluster) return { analyzed: 0, total: 0, percentage: 0 };
  const analyzed = cluster.analyzed_count ?? 0;
  const total = cluster.article_count ?? articles.length;
  if (total <= 0) return { analyzed: 0, total: 0, percentage: 0 };
  const percentage = Math.min(100, Math.round((analyzed / total) * 100));
  return { analyzed, total, percentage };
}

// ── Data Transformation ──

/**
 * Group articles by source, sorted by count descending.
 * @param {Array} articles
 * @returns {Array<[string, Array]>}
 */
export function groupArticlesBySource(articles) {
  if (!articles || articles.length === 0) return [];
  const map = {};
  for (const art of articles) {
    const src = art.source;
    if (!map[src]) map[src] = [];
    map[src].push(art);
  }
  return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
}

/**
 * Parse sources_json string safely.
 * @param {string|null|Array} sourcesJson
 * @returns {Array<{source: string, count: number}>}
 */
export function parseSourcesJson(sourcesJson) {
  if (!sourcesJson) return [];
  if (Array.isArray(sourcesJson)) return sourcesJson;
  if (typeof sourcesJson !== 'string') return [];
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Article Status ──

/**
 * Check if an article has been analyzed.
 * @param {Object} article
 * @returns {'analyzed' | 'pending'}
 */
export function getArticleAnalysisStatus(article) {
  if (!article) return 'pending';
  if (article.bias_score != null) return 'analyzed';
  if ((article.analysis_count ?? 0) > 0) return 'analyzed';
  return 'pending';
}

// ── Share ──

/**
 * Build share data for Web Share API.
 * @param {Object} cluster
 * @param {string} clusterId
 * @returns {{ title: string, text: string, url: string }}
 */
export function buildShareData(cluster, clusterId) {
  const url = `${PRODUCTION_URL}/event/${clusterId}`;
  if (!cluster) return { title: '', text: '', url };
  const title = `${cluster.representative_title} | PowerReader`;
  const text = `${cluster.representative_title} - ${cluster.article_count} 篇報導 · ${cluster.source_count} 家媒體 | PowerReader 台灣新聞立場分析`;
  return { title, text, url };
}

// ── Controversy ──

const CONTROVERSY_TIERS = [
  { max: 20, color: '#4CAF50', label: '低' },
  { max: 40, color: '#8BC34A', label: '中低' },
  { max: 60, color: '#FFC107', label: '中' },
  { max: 80, color: '#FF9800', label: '中高' },
  { max: 100, color: '#F44336', label: '高' },
];

/**
 * Get controversy tier config for a score.
 * @param {number|null|undefined} score
 * @returns {{ color: string, label: string, score: number } | null}
 */
export function getControversyTier(score) {
  if (score == null) return null;
  const tier = CONTROVERSY_TIERS.find(t => score <= t.max);
  if (!tier) return { ...CONTROVERSY_TIERS[4], score };
  return { ...tier, score };
}
