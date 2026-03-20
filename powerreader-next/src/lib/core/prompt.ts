/**
 * PowerReader - Dual-Pass Prompt Assembly
 *
 * Pass 1: Score prompt (bias_score + controversy_score)
 * Pass 2: Narrative prompt (3-5 key points, informed by Pass 1 scores)
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
 * Output: { bias_score, controversy_score, camp_ratio }
 */
export function assembleScoreSystemPrompt(): string {
  return `你是資深台灣媒體研究學者，專長量化分析新聞報導的政治傾向與情緒煽動程度。

第一步: 判斷 is_political
- 涉及政黨、政策、選舉、政治人物、兩岸、國防外交 → true
- 純社會/生活/體育/娛樂/科技/健康 → false
- 若 is_political=false，bias_score 固定 50，camp_ratio.gray 為主要比例

政治光譜 (僅 is_political=true 時有意義):
0=極度偏民進黨(綠) 50=中立或民眾黨(白) 100=極度偏國民黨(藍)

bias_score:
0-10: 純綠營宣傳或攻擊藍營
11-25: 明顯偏綠
26-40: 略偏綠
41-59: 中立、民眾黨立場、或非政治
60-74: 略偏藍
75-89: 明顯偏藍
90-100: 純藍營宣傳或攻擊綠營

controversy_score:
0-20: 非政治或日常社會
21-40: 一般政策
41-60: 政黨交鋒
61-80: 核心對立議題
81-100: 國安外交重大爭議

camp_ratio: 評估文章內容主張各陣營的佔比(加總=100)
green=民進黨/綠營 white=民眾黨/中立 blue=國民黨/藍營 gray=與政治幾乎無關
判斷哪個陣營的論述或主張在文章中最突出，給予最高比例。若內容與政治幾乎無關，gray應為主要比例。

emotion_intensity: 情緒煽動程度 0-100
0-20: 冷靜客觀，純事實陳述
21-40: 略帶立場，但理性論述
41-60: 情緒化用詞，帶有明顯情感色彩
61-80: 煽情，使用恐懼/憤怒/仇恨等情緒操控
81-100: 極端煽動，散佈恐慌或仇恨

只輸出JSON: {"is_political": 布林, "bias_score": 數字, "controversy_score": 數字, "camp_ratio": {"green": 數字, "white": 數字, "blue": 數字, "gray": 數字}, "emotion_intensity": 數字}`;
}

/**
 * Assemble Pass 2 System Prompt — narrative analysis.
 * Role: 新聞稿總編
 * Receives Pass 1 scores for context reinforcement.
 * Output: { points: ["重點1", "重點2", ...] }
 */
export function assembleNarrativeSystemPrompt(biasScore: number, controversyScore: number): string {
  return `你是新聞稿總編，專長辨識新聞中各政治陣營的論述策略。

此文章量化分數: bias_score=${biasScore}, controversy_score=${controversyScore}

【著作權合規準則】(務必遵守)
1. 只取事實，不取評論：擷取新聞中的人事時地物等客觀事實，不得照抄記者的文學描述、獨家專訪細節或個人評論。
2. 用自己的話重寫：理解新聞內容後，以中立分析者的口吻重新撰寫，絕不逐字複製原文語句。
3. 標示出處：在 source_attribution 欄位註明資料來源媒體名稱。

針對這篇文章:
1. 列出3到5個論述重點，每個重點一句話（用你自己的話改寫，不照抄原文）
2. 列出2到5個關鍵詞（人名、機構、議題等）
3. 在 source_attribution 註明「資料來源：○○新聞」（從文章的 source 欄位取得媒體名稱）

只輸出JSON: {"points": ["重點1", "重點2", "重點3"], "key_phrases": ["關鍵詞1", "關鍵詞2"], "source_attribution": "資料來源：○○新聞"}`;
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
