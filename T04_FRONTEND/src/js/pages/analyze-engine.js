/**
 * PowerReader - Analysis Engine
 *
 * Orchestrates the analysis pipeline:
 * fetch knowledge → run inference → update status UI.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { fetchArticleKnowledge } from '../api.js';
import { runAnalysis } from '../model/inference.js';

/**
 * Execute analysis: fetch knowledge, run inference, render result on success.
 */
export async function executeAnalysis(article, statusArea, resultArea, renderResultFn) {
  const analysisStartTime = Date.now();

  try {
    // Fetch RAG knowledge entries (gracefully degrade on failure)
    const knowledgeEntries = await fetchKnowledgeForArticle(article.article_id);

    const result = await runAnalysis({
      article,
      knowledgeEntries,
      onStatus: (stage, elapsed, extra) => {
        updateStatusUI(statusArea, stage, Date.now() - analysisStartTime, extra);
      }
    });

    const analysis_duration_ms = Date.now() - analysisStartTime;

    statusArea.hidden = true;
    resultArea.hidden = false;

    renderResultFn(resultArea, article, { ...result, analysis_duration_ms, knowledgeEntries });
  } catch (err) {
    console.error('[AnalysisEngine] Inference failed:', err);
    statusArea.innerHTML = '';

    const errMsg = document.createElement('p');
    errMsg.className = 'error-state';
    errMsg.textContent = '分析失敗，正在切換至伺服器模式...';
    statusArea.appendChild(errMsg);

    // Show error detail for debugging
    const errDetail = document.createElement('p');
    errDetail.className = 'analyze-status__elapsed';
    errDetail.textContent = err.message || '';
    statusArea.appendChild(errDetail);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn--primary';
    retryBtn.textContent = '重試';
    retryBtn.addEventListener('click', () => {
      statusArea.innerHTML = '';
      executeAnalysis(article, statusArea, resultArea, renderResultFn);
    });
    statusArea.appendChild(retryBtn);
  }
}

/**
 * Fetch RAG knowledge entries for an article. Gracefully degrades to empty array on failure.
 */
async function fetchKnowledgeForArticle(articleId) {
  try {
    const res = await fetchArticleKnowledge(articleId);
    if (res.success && Array.isArray(res.data?.knowledge_entries)) {
      return res.data.knowledge_entries;
    }
    if (res.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Update the status area with current inference stage and elapsed time.
 * Two distinct visual phases:
 *   1. Model download (loading_model) — progress bar with percentage
 *   2. Analysis (pass1/pass2) — stage indicator with spinner
 */
export function updateStatusUI(statusArea, stage, elapsedMs, extra) {
  statusArea.innerHTML = '';

  // ── Phase 1: Model Download ──
  if (stage === 'loading_model') {
    renderDownloadUI(statusArea, extra, elapsedMs);
    return;
  }

  // ── Phase 2: Analysis ──
  const stageMessages = {
    preparing: '正在組裝提示詞...',
    running: 'AI 分析中...',
    generating: '產生結果...',
    pass1_running: 'Pass 1/2: 分數分析中...',
    pass1_done: 'Pass 1 完成，開始論述分析...',
    pass2_running: 'Pass 2/2: 論述重點分析中...',
    pass2_done: '分析完成',
    fallback_to_server: '分析失敗，正在切換至伺服器模式...'
  };

  // Stage label
  const msg = document.createElement('p');
  msg.className = 'analyze-status__message';
  msg.textContent = stageMessages[stage] || 'AI 分析中...';
  statusArea.appendChild(msg);

  // Pass indicator (1/2 or 2/2)
  if (stage === 'pass1_running' || stage === 'pass1_done' ||
      stage === 'pass2_running' || stage === 'pass2_done') {
    const passNum = stage.startsWith('pass1') ? 1 : 2;
    const stepEl = document.createElement('p');
    stepEl.className = 'analyze-status__step';
    stepEl.textContent = `${passNum} / 2`;
    statusArea.appendChild(stepEl);
  }

  // Indeterminate progress animation
  const progress = document.createElement('div');
  progress.className = 'analyze-status__progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '內容載入中，請稍候');
  statusArea.appendChild(progress);

  // Elapsed time
  const elapsed = document.createElement('p');
  elapsed.className = 'analyze-status__elapsed';
  elapsed.textContent = `${Math.floor(elapsedMs / 1000)}s`;
  statusArea.appendChild(elapsed);
}

/**
 * Render model download UI with real progress bar.
 */
function renderDownloadUI(container, extra, elapsedMs) {
  // Heading
  const heading = document.createElement('h3');
  heading.className = 'analyze-download__heading';
  heading.textContent = '下載 AI 模型';
  container.appendChild(heading);

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'analyze-download__subtitle';
  subtitle.textContent = '首次使用需下載模型 (約 4.5GB)，下載完成後將自動開始分析';
  container.appendChild(subtitle);

  // Progress percentage
  const pct = extra && typeof extra.progress === 'number'
    ? Math.round(extra.progress * 100)
    : 0;

  // Progress bar (determinate)
  const barTrack = document.createElement('div');
  barTrack.className = 'analyze-download__bar-track';
  barTrack.setAttribute('role', 'progressbar');
  barTrack.setAttribute('aria-valuenow', String(pct));
  barTrack.setAttribute('aria-valuemin', '0');
  barTrack.setAttribute('aria-valuemax', '100');

  const barFill = document.createElement('div');
  barFill.className = 'analyze-download__bar-fill';
  barFill.style.width = `${pct}%`;
  barTrack.appendChild(barFill);
  container.appendChild(barTrack);

  // Percentage text
  const pctText = document.createElement('p');
  pctText.className = 'analyze-download__pct';
  pctText.textContent = `${pct}%`;
  container.appendChild(pctText);

  // Detail text from WebLLM (chunk info)
  if (extra && extra.text) {
    const detail = document.createElement('p');
    detail.className = 'analyze-download__detail';
    const shortText = parseDownloadDetail(extra.text);
    detail.textContent = shortText;
    container.appendChild(detail);
  }

  // Elapsed time
  const elapsed = document.createElement('p');
  elapsed.className = 'analyze-status__elapsed';
  elapsed.textContent = `${Math.floor(elapsedMs / 1000)}s`;
  container.appendChild(elapsed);
}

/**
 * Parse WebLLM progress text into a shorter readable string.
 * Input:  "Fetching param cache[42/74]: 1292MB fetched. 59% completed, 10 secs elapsed. ..."
 * Output: "42 / 74 區塊 · 1292MB"
 */
function parseDownloadDetail(text) {
  const chunkMatch = text.match(/\[(\d+)\/(\d+)\]/);
  const mbMatch = text.match(/(\d+)MB/);
  if (chunkMatch && mbMatch) {
    return `${chunkMatch[1]} / ${chunkMatch[2]} 區塊 · ${mbMatch[1]}MB`;
  }
  if (mbMatch) {
    return `${mbMatch[1]}MB`;
  }
  return text.substring(0, 60);
}
