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

const ARTICLE_MAX_CHARS = 8400; // 40% context window rule (~13K tokens)

/**
 * Assemble Pass 1 System Prompt — score extraction.
 * Role: 資深台灣媒體研究學者
 * Output: { bias_score, controversy_score, camp_ratio }
 * @returns {string}
 */
export function assembleScoreSystemPrompt() {
  return `你是資深台灣媒體研究學者，專長量化分析新聞報導的政治傾向。

政治光譜:
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
41-60: 藍綠交鋒
61-80: 核心對立議題
81-100: 國安外交重大爭議

camp_ratio: 評估文章內容主張各陣營的佔比(加總=100)
green=民進黨/綠營 white=民眾黨/中立 blue=國民黨/藍營 gray=與政治幾乎無關
判斷哪個陣營的論述或主張在文章中最突出，給予最高比例。若內容與政治幾乎無關，gray應為主要比例。

只輸出JSON: {"bias_score": 數字, "controversy_score": 數字, "camp_ratio": {"green": 數字, "white": 數字, "blue": 數字, "gray": 數字}}`;
}

/**
 * Assemble Pass 2 System Prompt — narrative analysis.
 * Role: 新聞稿總編
 * Receives Pass 1 scores for context reinforcement.
 * Output: { points: ["重點1", "重點2", ...] }
 *
 * @param {number} biasScore - Pass 1 bias_score (0-100)
 * @param {number} controversyScore - Pass 1 controversy_score (0-100)
 * @returns {string}
 */
export function assembleNarrativeSystemPrompt(biasScore, controversyScore) {
  return `你是新聞稿總編，專長辨識新聞中各政治陣營的論述策略。

此文章量化分數: bias_score=${biasScore}, controversy_score=${controversyScore}

針對這篇文章:
1. 列出3到5個論述重點，每個重點一句話
2. 列出2到5個關鍵詞（人名、機構、議題等）

只輸出JSON: {"points": ["重點1", "重點2", "重點3"], "key_phrases": ["關鍵詞1", "關鍵詞2"]}`;
}

/**
 * Assemble Layer 2 + Layer 3 user message.
 * Shared by both Pass 1 and Pass 2.
 *
 * L2: RAG knowledge injection (dynamic)
 * L3: Article content as JSON
 *
 * @param {Object} article - Article object with title, summary, content_markdown, source, author, published_at
 * @param {Array} knowledgeEntries - RAG knowledge entries from API
 * @returns {string}
 */
export function assembleUserMessage(article, knowledgeEntries) {
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
 * Maps knowledge types to Chinese tags: politician->人物, topic->議題, term->名詞, event->事件
 *
 * @param {Array} entries - Knowledge entries from fetchArticleKnowledge
 * @returns {string} Formatted L2 text, or empty string if no entries
 */
export function formatKnowledgeAsL2(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';

  // Filter out zero-relevance entries — they waste context tokens and add noise.
  // Keep entries without score field (backward compat with APIs that don't return scores).
  const relevant = entries.filter(e => e.score == null || e.score > 0);
  if (relevant.length === 0) return '';

  const typeLabels = {
    politician: '人物',
    topic: '議題',
    term: '名詞',
    event: '事件',
    media: '媒體'
  };

  const lines = relevant.map(entry => {
    const label = typeLabels[entry.type] || entry.type || '其他';
    const text = entry.content || entry.snippet || entry.title || '';
    return `- [${label}] ${text}`;
  });

  return `[背景知識]\n以下為可能相關的背景知識，請自行判斷哪些與本文直接相關，忽略無關項目。\n${lines.join('\n')}`;
}
