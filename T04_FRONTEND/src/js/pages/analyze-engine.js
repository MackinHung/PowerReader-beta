/**
 * PowerReader - Analysis Engine
 *
 * Orchestrates the analysis pipeline:
 * fetch knowledge → run inference → update status UI.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
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
    errMsg.textContent = t('error.model.inference_failed');
    statusArea.appendChild(errMsg);

    // Show error detail for debugging
    const errDetail = document.createElement('p');
    errDetail.className = 'analyze-status__elapsed';
    errDetail.textContent = err.message || '';
    statusArea.appendChild(errDetail);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn--primary';
    retryBtn.textContent = t('common.button.retry');
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
function updateStatusUI(statusArea, stage, elapsedMs, extra) {
  statusArea.innerHTML = '';

  // ── Phase 1: Model Download ──
  if (stage === 'loading_model') {
    renderDownloadUI(statusArea, extra, elapsedMs);
    return;
  }

  // ── Phase 2: Analysis ──
  const stageMessages = {
    preparing: t('model.inference.preparing'),
    running: t('model.inference.running'),
    generating: t('model.inference.generating'),
    pass1_running: t('model.inference.pass1_running'),
    pass1_done: t('model.inference.pass1_done'),
    pass2_running: t('model.inference.pass2_running'),
    pass2_done: t('model.inference.pass2_done'),
    fallback_to_server: t('error.model.inference_failed')
  };

  // Stage label
  const msg = document.createElement('p');
  msg.className = 'analyze-status__message';
  msg.textContent = stageMessages[stage] || t('model.inference.running');
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
  progress.setAttribute('aria-label', t('a11y.status.loading'));
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
  heading.textContent = t('model.download.heading');
  container.appendChild(heading);

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'analyze-download__subtitle';
  subtitle.textContent = t('model.download.first_time_hint');
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
    return `${chunkMatch[1]} / ${chunkMatch[2]} ${t('model.download.chunks')} · ${mbMatch[1]}MB`;
  }
  if (mbMatch) {
    return `${mbMatch[1]}MB`;
  }
  return text.substring(0, 60);
}
