/**
 * PowerReader - Event Detail Page Helpers
 *
 * Pure functions for event detail page logic.
 * Extracted for testability (TDD) before wiring into the Svelte page.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { Article } from '../types/index.js';

const PRODUCTION_URL = 'https://powerreader.pages.dev';

// ── Analysis State ──

interface ClusterInfo {
  analyzed_count?: number;
  article_count?: number;
  source_count?: number;
  representative_title?: string;
}

interface SourceEntry {
  source: string;
  count: number;
}

interface ControversyTierResult {
  max: number;
  color: string;
  label: string;
  score: number;
}

interface ShareData {
  title: string;
  text: string;
  url: string;
}

interface AnalysisProgress {
  analyzed: number;
  total: number;
  percentage: number;
}

type AnalysisState = 'none' | 'partial' | 'complete';

export function getAnalysisState(cluster: ClusterInfo | null): AnalysisState {
  if (!cluster) return 'none';
  const analyzed = cluster.analyzed_count ?? 0;
  const total = cluster.article_count ?? 0;
  if (analyzed <= 0 || total <= 0) return 'none';
  if (analyzed >= total) return 'complete';
  return 'partial';
}

export function getAnalysisProgress(cluster: ClusterInfo | null, articles: Article[] = []): AnalysisProgress {
  if (!cluster) return { analyzed: 0, total: 0, percentage: 0 };
  const analyzed = cluster.analyzed_count ?? 0;
  const total = cluster.article_count ?? articles.length;
  if (total <= 0) return { analyzed: 0, total: 0, percentage: 0 };
  const percentage = Math.min(100, Math.round((analyzed / total) * 100));
  return { analyzed, total, percentage };
}

// ── Data Transformation ──

export function groupArticlesBySource(articles: Article[]): [string, Article[]][] {
  if (!articles || articles.length === 0) return [];
  const map: Record<string, Article[]> = {};
  for (const art of articles) {
    const src = art.source;
    if (!map[src]) map[src] = [];
    map[src].push(art);
  }
  return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
}

export function parseSourcesJson(sourcesJson: string | null | SourceEntry[]): SourceEntry[] {
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

export function getArticleAnalysisStatus(article: Record<string, unknown> | null): 'analyzed' | 'pending' {
  if (!article) return 'pending';
  if (article.bias_score != null) return 'analyzed';
  if (((article.analysis_count as number) ?? 0) > 0) return 'analyzed';
  return 'pending';
}

// ── Share ──

export function buildShareData(cluster: ClusterInfo | null, clusterId: string): ShareData {
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

export function getControversyTier(score: number | null | undefined): ControversyTierResult | null {
  if (score == null) return null;
  const tier = CONTROVERSY_TIERS.find(t => score <= t.max);
  if (!tier) return { ...CONTROVERSY_TIERS[4], score };
  return { ...tier, score };
}
