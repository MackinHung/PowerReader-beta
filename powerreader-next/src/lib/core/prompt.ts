/**
 * PowerReader - Dual-Pass Prompt Assembly
 *
 * Pass 1: Score prompt (bias_score, camp_ratio, emotion_intensity)
 * Pass 2: Narrative prompt (3-5 key points + stances)
 *
 * Both passes share the same user message:
 *   L2 (RAG): Dynamic knowledge injection
 *   L3 (Input): Article content as JSON
 *
 * 40% rule: Total prompt <= 13K tokens (~8400 Chinese chars for article)
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { Article, KnowledgeEntry } from '$lib/types/models.js';

const ARTICLE_MAX_CHARS: number = 8400; // 40% context window rule (~13K tokens)

/**
 * Assemble Pass 1 System Prompt — score extraction.
 * Role: 資深台灣媒體研究學者
 * Output: { is_political, bias_score, camp_ratio, emotion_intensity }
 */
export function assembleScoreSystemPrompt(): string {
  return `你是資深台灣媒體研究學者，專長量化分析新聞報導的政治傾向與情緒煽動程度。

第一步: 判斷 is_political
- 涉及政黨、政策、選舉、政治人物、兩岸、國防外交 → true
- 純社會/生活/體育/娛樂/科技/健康 → false
- 若 is_political=false，bias_score 固定 50，camp_ratio.gray 為主要比例

政治光譜 (僅 is_political=true 時有意義):
0=極度偏綠 50=中立/白 100=極度偏藍

bias_score 0-100:
0-10:純綠營宣傳 11-25:明顯偏綠 26-40:略偏綠
41-59:中立/民眾黨/非政治 60-74:略偏藍 75-89:明顯偏藍 90-100:純藍營宣傳

camp_ratio: 各陣營論述佔比(加總=100)
green=綠營 white=白營/中立 blue=藍營 gray=非政治

emotion_intensity 0-100:
0-20:冷靜客觀 21-40:略帶立場 41-60:情緒化 61-80:煽情 81-100:極端煽動

只輸出JSON: {"is_political": 布林, "bias_score": 數字, "camp_ratio": {"green": 數字, "white": 數字, "blue": 數字, "gray": 數字}, "emotion_intensity": 數字}`;
}

/**
 * Assemble Pass 2 System Prompt — narrative analysis.
 * Role: 新聞稿總編
 * Output: { points, key_phrases, stances }
 */
export function assembleNarrativeSystemPrompt(): string {
  return `你是新聞稿總編，專長辨識新聞中各政治陣營的論述策略。

【著作權合規】用自己的話改寫，不照抄原文。

針對這篇文章:
1. 列出3到5個論述重點（每個一句話，用你自己的話改寫）
2. 列出2到5個關鍵詞（人名、機構、議題等）
3. 分析各政黨/陣營的立場：key=黨派名稱, value="手法+一句話描述"（僅列出文中可辨識的陣營，非政治文章可為空物件）

只輸出JSON: {"points": ["重點1", "重點2"], "key_phrases": ["關鍵詞1", "關鍵詞2"], "stances": {"民進黨": "手法+描述", "國民黨": "手法+描述"}}`;
}

/**
 * Assemble Layer 2 + Layer 3 user message.
 * Shared by both Pass 1 and Pass 2.
 *
 * L2: RAG knowledge injection (dynamic)
 * L3: Article content as JSON
 */
export function assembleUserMessage(article: Article, knowledgeEntries: KnowledgeEntry[]): string {
  // Layer 2: RAG knowledge injection
  const layer2 = formatKnowledgeAsL2(knowledgeEntries);

  // Layer 3: Article as JSON (truncate content_markdown to ARTICLE_MAX_CHARS)
  const articlePayload = JSON.stringify({
    title: article.title || '',
    summary: article.summary || '',
    content_markdown: (article.content_markdown || '').slice(0, ARTICLE_MAX_CHARS),
    source: article.source || '',
    author: article.author || null,
    published_at: article.published_at || ''
  }, null, 0);

  return layer2 ? `${layer2}\n\n${articlePayload}` : articlePayload;
}

/**
 * Format RAG knowledge entries as Layer 2 injection text.
 * Schema v2: serializes structured fields for figure/issue/incident types.
 * Falls back to flat content for legacy entries.
 */
export function formatKnowledgeAsL2(entries: KnowledgeEntry[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';

  // Filter out zero-relevance entries — they waste context tokens and add noise.
  // Keep entries without score field (backward compat with APIs that don't return scores).
  const relevant = entries.filter((e: KnowledgeEntry) => e.score == null || e.score > 0);
  if (relevant.length === 0) return '';

  const typeLabels: Record<string, string> = {
    politician: '人物',
    figure: '人物',
    topic: '議題',
    issue: '議題',
    event: '事件',
    incident: '事件',
  };

  const lines = relevant.map((entry: KnowledgeEntry) => {
    const label = typeLabels[entry.type] || entry.type || '其他';
    const text = serializeEntry(entry);
    return `- [${label}] ${text}`;
  });

  return `[背景知識]\n以下為可能相關的背景知識，請自行判斷哪些與本文直接相關，忽略無關項目。\n${lines.join('\n')}`;
}

/**
 * Serialize a knowledge entry to a compact text representation for prompt injection.
 * Prefers structured fields when available, falls back to flat content.
 */
function serializeEntry(entry: KnowledgeEntry): string {
  const e = entry as Record<string, unknown>;
  const type = entry.type;

  // Figure type: title(party): period。background
  if (type === 'figure' || type === 'politician') {
    const party = e.party ? `(${e.party})` : '';
    const parts = [e.period, e.background].filter(Boolean);
    if (parts.length > 0) {
      return `${entry.title}${party}: ${parts.join('。')}`;
    }
    return e.content as string || entry.title || '';
  }

  // Issue type: title: description\n立場比較:\nDPP: ...\nKMT: ...\nTPP: ...
  if (type === 'issue' || type === 'topic') {
    const stances = e.stances as Record<string, string> | undefined;
    const desc = e.description ? `${entry.title}: ${e.description}` : entry.title;
    if (stances) {
      const stanceLines = ['DPP', 'KMT', 'TPP']
        .filter(p => stances[p])
        .map(p => `${p}: ${stances[p]}`);
      if (stanceLines.length > 0) {
        return `${desc}\n立場比較:\n${stanceLines.join('\n')}`;
      }
    }
    return desc;
  }

  // Incident type: title(date): description [keywords]
  if (type === 'incident' || type === 'event') {
    const date = e.date ? `(${e.date})` : '';
    const desc = (e.description || e.content || '') as string;
    const kw = Array.isArray(e.keywords) && e.keywords.length > 0
      ? ` [${(e.keywords as string[]).join(', ')}]`
      : '';
    return `${entry.title}${date}: ${desc}${kw}`;
  }

  // Fallback for unknown types
  return (e.content as string) || (e as Record<string, unknown>).snippet as string || entry.title || '';
}
