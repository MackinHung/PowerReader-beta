/**
 * PowerReader - Group Analysis Module
 *
 * Cross-media group analysis: when 3+ articles from 3+ different sources
 * have been individually analyzed, produce a group-level comparative report.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { openDB } from './db.js';
import { promisifyRequest, promisifyTransaction } from '$lib/utils/idb-helpers.js';
import type {
  Article,
  AnalysisResult,
  CampType,
  SourceBreakdown,
  CampStatistics,
  GroupAnalysisResult,
} from '$lib/types/models.js';
import type { CampRatio } from '$lib/types/api.js';

// ── Constants ──

const MIN_ANALYZED_ARTICLES = 3;
const MIN_DISTINCT_SOURCES = 3;
const GROUP_PROMPT_VERSION = 'v4.0.0';

// ── Readiness Check ──

export interface GroupReadiness {
  ready: boolean;
  analyzed_count: number;
  source_count: number;
  message: string;
}

/**
 * Check if a set of articles/analyses meets the threshold for group analysis.
 * Requires >= 3 analyzed articles from >= 3 distinct sources.
 */
export function checkGroupReadiness(
  articles: Article[],
  analyses: Map<string, AnalysisResult>
): GroupReadiness {
  if (!articles || articles.length === 0) {
    return { ready: false, analyzed_count: 0, source_count: 0, message: '尚無文章' };
  }

  // Count analyzed articles and distinct sources
  const analyzedArticles = articles.filter(a => analyses.has(a.article_id));
  const analyzedCount = analyzedArticles.length;
  const distinctSources = new Set(analyzedArticles.map(a => a.source));
  const sourceCount = distinctSources.size;

  if (analyzedCount < MIN_ANALYZED_ARTICLES || sourceCount < MIN_DISTINCT_SOURCES) {
    return {
      ready: false,
      analyzed_count: analyzedCount,
      source_count: sourceCount,
      message: `分析數量不足（需要${MIN_DISTINCT_SOURCES}家以上不同媒體的分析結果，目前 ${sourceCount} 家 ${analyzedCount} 篇）`,
    };
  }

  return {
    ready: true,
    analyzed_count: analyzedCount,
    source_count: sourceCount,
    message: '',
  };
}

// ── Camp Determination ──

/**
 * Determine the dominant camp from a camp_ratio.
 * Returns the camp with the highest ratio value.
 * On tie, prefers in order: green > blue > white > gray.
 */
export function getDominantCamp(campRatio: CampRatio | null | undefined): CampType {
  if (!campRatio) return 'gray';

  const entries: [CampType, number][] = [
    ['green', campRatio.green ?? 0],
    ['blue', campRatio.blue ?? 0],
    ['white', campRatio.white ?? 0],
    ['gray', campRatio.gray ?? 0],
  ];

  let maxCamp: CampType = 'gray';
  let maxVal = -1;

  for (const [camp, val] of entries) {
    if (val > maxVal) {
      maxVal = val;
      maxCamp = camp;
    }
  }

  return maxCamp;
}

// ── Camp Statistics ──

/**
 * Compute per-camp statistics from analyzed articles.
 * Groups articles by their dominant camp, then computes per-group averages.
 */
export function computeCampStatistics(
  articles: Article[],
  analyses: Map<string, AnalysisResult>
): CampStatistics[] {
  // Build per-camp buckets
  const buckets: Record<CampType, { bias: number[]; controversy: number[]; emotion: number[]; sources: Set<string> }> = {
    green: { bias: [], controversy: [], emotion: [], sources: new Set() },
    white: { bias: [], controversy: [], emotion: [], sources: new Set() },
    blue: { bias: [], controversy: [], emotion: [], sources: new Set() },
    gray: { bias: [], controversy: [], emotion: [], sources: new Set() },
  };

  for (const article of articles) {
    const analysis = analyses.get(article.article_id);
    if (!analysis) continue;

    const camp = getDominantCamp(analysis.camp_ratio);
    buckets[camp].bias.push(analysis.bias_score);
    buckets[camp].controversy.push(analysis.controversy_score);
    buckets[camp].emotion.push(analysis.emotion_intensity ?? 50);
    buckets[camp].sources.add(article.source);
  }

  // Convert to CampStatistics array (only non-empty camps)
  const result: CampStatistics[] = [];
  for (const camp of ['green', 'white', 'blue', 'gray'] as CampType[]) {
    const bucket = buckets[camp];
    if (bucket.bias.length === 0) continue;

    result.push({
      camp,
      avg_bias_score: Math.round(avg(bucket.bias)),
      avg_controversy_score: Math.round(avg(bucket.controversy)),
      avg_emotion_intensity: Math.round(avg(bucket.emotion)),
      article_count: bucket.bias.length,
      sources: Array.from(bucket.sources),
    });
  }

  return result;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

// ── Group Analysis Prompt ──

export interface GroupSourceInput {
  source: string;
  bias_score: number;
  emotion_intensity: number;
  points: string[];
  key_phrases: string[];
}

/**
 * Assemble the system prompt for group-level cross-media analysis.
 */
export function assembleGroupAnalysisPrompt(): string {
  return `你是資深台灣媒體研究學者，擅長跨媒體比較分析。

你將收到多個不同媒體來源對同一事件的分析數據（包含立場分數、情緒程度、論述重點和關鍵詞）。

請綜合分析後輸出JSON:
{
  "source_summaries": [
    {"source": "媒體名", "camp": "green|white|blue|gray", "summary": "一句話描述該媒體的報導角度"}
  ],
  "group_summary": "整體跨媒體比較摘要（2-3句話）",
  "bias_direction": "偏綠|偏藍|中立|多元"
}

判斷 bias_direction 規則:
- 多數來源偏綠(bias_score<40) → "偏綠"
- 多數來源偏藍(bias_score>60) → "偏藍"
- 多數來源在41-59 → "中立"
- 來源立場分散 → "多元"

只輸出JSON，不要額外說明。`;
}

/**
 * Format source analysis data as user message for group prompt.
 */
export function assembleGroupUserMessage(sources: GroupSourceInput[]): string {
  const data = sources.map(s => ({
    source: s.source,
    bias_score: s.bias_score,
    emotion_intensity: s.emotion_intensity,
    points: s.points.slice(0, 5),
    key_phrases: s.key_phrases.slice(0, 5),
  }));
  return JSON.stringify(data, null, 0);
}

// ── Group Output Parser ──

interface GroupPromptOutput {
  source_summaries: Array<{ source: string; camp: string; summary: string }>;
  group_summary: string;
  bias_direction: string;
}

/**
 * Parse the group analysis AI output.
 */
export function parseGroupOutput(raw: string): GroupPromptOutput {
  const defaults: GroupPromptOutput = {
    source_summaries: [],
    group_summary: '',
    bias_direction: '多元',
  };

  if (!raw || typeof raw !== 'string') return defaults;

  // Strip <think> blocks
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return defaults;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const source_summaries = Array.isArray(parsed.source_summaries)
      ? parsed.source_summaries
          .filter((s: unknown) => s && typeof s === 'object')
          .map((s: Record<string, unknown>) => ({
            source: String(s.source || ''),
            camp: validateCamp(String(s.camp || 'gray')),
            summary: String(s.summary || ''),
          }))
      : [];

    const group_summary = typeof parsed.group_summary === 'string'
      ? parsed.group_summary
      : '';

    const validDirections = ['偏綠', '偏藍', '中立', '多元'];
    const bias_direction = validDirections.includes(parsed.bias_direction)
      ? parsed.bias_direction
      : '多元';

    return { source_summaries, group_summary, bias_direction };
  } catch {
    return defaults;
  }
}

function validateCamp(camp: string): CampType {
  const valid: CampType[] = ['green', 'white', 'blue', 'gray'];
  return valid.includes(camp as CampType) ? (camp as CampType) : 'gray';
}

// ── Run Group Analysis ──

/**
 * Run the full group analysis pipeline:
 * 1. Collect individual analyses
 * 2. Compute camp statistics
 * 3. Run AI group prompt (via WebLLM or server)
 * 4. Merge results and store in IDB
 */
export async function runGroupAnalysis(
  clusterId: string,
  articles: Article[],
  analyses: Map<string, AnalysisResult>,
  runInference: (systemPrompt: string, userMessage: string) => Promise<string>
): Promise<GroupAnalysisResult> {
  // 1. Collect source inputs
  const sourceMap = new Map<string, GroupSourceInput>();
  for (const article of articles) {
    const analysis = analyses.get(article.article_id);
    if (!analysis) continue;

    const existing = sourceMap.get(article.source);
    if (!existing) {
      sourceMap.set(article.source, {
        source: article.source,
        bias_score: analysis.bias_score,
        emotion_intensity: analysis.emotion_intensity ?? 50,
        points: analysis.points || [],
        key_phrases: analysis.key_phrases || [],
      });
    }
  }

  const sourceInputs = Array.from(sourceMap.values());

  // 2. Compute camp statistics
  const campStats = computeCampStatistics(articles, analyses);

  // 3. Run AI group prompt
  const systemPrompt = assembleGroupAnalysisPrompt();
  const userMessage = assembleGroupUserMessage(sourceInputs);
  const rawOutput = await runInference(systemPrompt, userMessage);
  const aiResult = parseGroupOutput(rawOutput);

  // 4. Build source breakdowns
  const sourceBreakdowns: SourceBreakdown[] = sourceInputs.map(input => {
    const aiSummary = aiResult.source_summaries.find(s => s.source === input.source);
    return {
      source: input.source,
      camp: (aiSummary?.camp as CampType) || getDominantCamp(null),
      bias_score: input.bias_score,
      emotion_intensity: input.emotion_intensity,
      summary: aiSummary?.summary || '',
    };
  });

  // 5. Build final result
  const result: GroupAnalysisResult = {
    cluster_id: clusterId,
    analyzed_at: new Date().toISOString(),
    source_breakdowns: sourceBreakdowns,
    camp_statistics: campStats,
    group_summary: aiResult.group_summary,
    bias_direction: aiResult.bias_direction,
    total_articles: articles.filter(a => analyses.has(a.article_id)).length,
    total_sources: sourceMap.size,
    prompt_version: GROUP_PROMPT_VERSION,
  };

  // 6. Store in IDB
  await storeGroupAnalysis(result);

  return result;
}

// ── IDB Helpers ──

/**
 * Store a group analysis result in IndexedDB.
 */
export async function storeGroupAnalysis(result: GroupAnalysisResult): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('group_analyses', 'readwrite');
    tx.objectStore('group_analyses').put(result);
    await promisifyTransaction(tx);
    db.close();
  } catch (e) {
    console.error('[GroupAnalysis] Failed to store:', e);
  }
}

/**
 * Retrieve a group analysis result from IndexedDB.
 */
export async function getGroupAnalysis(clusterId: string): Promise<GroupAnalysisResult | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('group_analyses', 'readonly');
    const result = await promisifyRequest(tx.objectStore('group_analyses').get(clusterId));
    db.close();
    return (result as GroupAnalysisResult) || null;
  } catch {
    return null;
  }
}
