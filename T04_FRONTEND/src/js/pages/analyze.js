/**
 * PowerReader - Analysis Page (Main Entry)
 *
 * Allows users to run local AI bias analysis on articles.
 * Routes: #/analyze (selection prompt) or #/analyze/:hash (analyze article)
 *
 * Split into:
 *   analyze-checks.js  — Pre-analysis validation + blocked state UI
 *   analyze-engine.js  — Inference pipeline + status UI
 *   analyze-result.js  — Result preview + submit/retry
 *   analyze-helpers.js — Deadline indicator + error rendering
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { fetchArticle } from '../api.js';
import { runPreAnalysisChecks, renderBlockedState } from './analyze-checks.js';
import { executeAnalysis } from './analyze-engine.js';
import { renderResultPreview } from './analyze-result.js';
import { createDeadlineIndicator, renderAnalyzeError } from './analyze-helpers.js';
import { checkWifi, checkBattery, checkStorage } from '../model/manager.js';
import { getQueueStatus, onQueueChange } from '../model/queue.js';
import { getAutoRunnerStatus } from '../model/auto-runner.js';

/**
 * Render analysis page.
 * @param {HTMLElement} container
 * @param {Object} [params] - Route params { hash: article_id }
 */
export async function renderAnalyze(container, params) {
  container.innerHTML = '';

  // If no article hash, show selection prompt
  if (!params || !params.hash) {
    renderSelectPrompt(container);
    return;
  }

  const articleId = params.hash;

  // Loading
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.textContent = t('common.label.loading');
  container.appendChild(loadingEl);

  // Fetch article
  const result = await fetchArticle(articleId);
  container.innerHTML = '';

  if (!result.success) {
    renderAnalyzeError(container, result.error?.message || t('error.message.generic'));
    return;
  }

  const article = result.data;

  // Pre-checks
  const checks = await runPreAnalysisChecks(article);
  if (!checks.canAnalyze) {
    renderBlockedState(container, checks, article, () => {
      renderAnalyze(container, { hash: article.article_id });
    });
    return;
  }

  renderAnalysisUI(container, article);
}

// =============================================
// Selection Prompt (no article selected)
// =============================================

function renderSelectPrompt(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'analyze-select';

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = t('nav.title.analyze');
  wrapper.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'analyze-select__desc';
  desc.textContent = t('analyze.select_prompt');
  wrapper.appendChild(desc);

  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn--primary';
  homeBtn.textContent = t('nav.button.home');
  homeBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  wrapper.appendChild(homeBtn);

  container.appendChild(wrapper);
}

// =============================================
// Analysis UI
// =============================================

function renderAnalysisUI(container, article) {
  const wrapper = document.createElement('div');
  wrapper.className = 'analyze-page';

  // Header
  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = t('nav.title.analyze');
  wrapper.appendChild(heading);

  // Article info
  const articleInfo = document.createElement('div');
  articleInfo.className = 'analyze-article-info';

  const title = document.createElement('h3');
  title.textContent = article.title || '';
  articleInfo.appendChild(title);

  // 72h deadline indicator
  if (article.published_at) {
    const deadline = createDeadlineIndicator(article.published_at);
    if (deadline) articleInfo.appendChild(deadline);
  }

  wrapper.appendChild(articleInfo);

  // Check if this article is already in queue or if queue is busy
  const queueStatus = getQueueStatus();
  const articleId = article.article_id;
  const isInQueue = (queueStatus.currentJob && queueStatus.currentJob.articleId === articleId)
    || queueStatus.pending.includes(articleId);
  const queueBusy = queueStatus.currentJob !== null || queueStatus.pending.length > 0;

  // Start analysis button
  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn--primary analyze-start-btn';
  startBtn.textContent = t('common.button.start_analysis');
  startBtn.setAttribute('aria-label', t('a11y.button.analyze'));

  // Queue warning area
  const queueWarning = document.createElement('p');
  queueWarning.className = 'analyze-queue-warning';
  queueWarning.hidden = true;

  if (isInQueue) {
    startBtn.disabled = true;
    queueWarning.hidden = false;
    queueWarning.textContent = t('analyze.already_in_queue');
  } else if (queueBusy) {
    queueWarning.hidden = false;
    queueWarning.textContent = t('analyze.queue_busy_warning');
  }

  wrapper.appendChild(queueWarning);
  wrapper.appendChild(startBtn);

  // Subscribe to queue changes to update button state
  const unsubQueue = onQueueChange((qs) => {
    const stillInQueue = (qs.currentJob && qs.currentJob.articleId === articleId)
      || qs.pending.includes(articleId);
    const stillBusy = qs.currentJob !== null || qs.pending.length > 0;

    if (stillInQueue) {
      startBtn.disabled = true;
      queueWarning.hidden = false;
      queueWarning.textContent = t('analyze.already_in_queue');
    } else if (stillBusy) {
      startBtn.disabled = false;
      queueWarning.hidden = false;
      queueWarning.textContent = t('analyze.queue_busy_warning');
    } else {
      startBtn.disabled = false;
      queueWarning.hidden = true;
    }
  });

  // Download confirmation area (hidden by default)
  const confirmArea = document.createElement('div');
  confirmArea.className = 'analyze-download-confirm';
  confirmArea.hidden = true;
  wrapper.appendChild(confirmArea);

  // Status area
  const statusArea = document.createElement('div');
  statusArea.className = 'analyze-status';
  statusArea.hidden = true;
  wrapper.appendChild(statusArea);

  // Result area
  const resultArea = document.createElement('div');
  resultArea.className = 'analyze-result';
  resultArea.hidden = true;
  wrapper.appendChild(resultArea);

  // Wire up start button
  startBtn.addEventListener('click', async () => {
    unsubQueue(); // stop watching once user starts

    const modelCached = localStorage.getItem('powerreader_webllm_cached') === '1';

    if (modelCached) {
      // Model already downloaded — start directly
      startBtn.disabled = true;
      startBtn.hidden = true;
      queueWarning.hidden = true;
      statusArea.hidden = false;
      await executeAnalysis(article, statusArea, resultArea, renderResultPreview);
    } else {
      // First time — show download confirmation with device checks
      startBtn.hidden = true;
      queueWarning.hidden = true;
      confirmArea.hidden = false;
      await renderDownloadConfirm(confirmArea, () => {
        confirmArea.hidden = true;
        statusArea.hidden = false;
        executeAnalysis(article, statusArea, resultArea, renderResultPreview);
      }, () => {
        confirmArea.hidden = true;
        startBtn.hidden = false;
      });
    }
  });

  container.appendChild(wrapper);
}

/**
 * Render download confirmation screen with device condition checks.
 * @param {HTMLElement} container
 * @param {function} onConfirm - Called when user confirms download
 * @param {function} onCancel - Called when user cancels
 */
async function renderDownloadConfirm(container, onConfirm, onCancel) {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'analyze-download-confirm__card';

  // Heading
  const heading = document.createElement('h3');
  heading.textContent = t('model.download.confirm_heading');
  card.appendChild(heading);

  // Description
  const desc = document.createElement('p');
  desc.className = 'analyze-download-confirm__desc';
  desc.textContent = t('model.download.confirm_desc');
  card.appendChild(desc);

  // Run device checks
  const [wifi, battery, storage] = await Promise.all([
    checkWifi(),
    checkBattery(),
    checkStorage()
  ]);

  const checks = [
    { label: t('model.download.check_wifi'), ok: wifi.ok, reason: wifi.reason },
    { label: t('model.download.check_battery'), ok: battery.ok, reason: battery.reason },
    { label: t('model.download.check_storage'), ok: storage.ok, reason: storage.reason }
  ];

  let hasBlocker = false;

  const checkList = document.createElement('ul');
  checkList.className = 'analyze-download-confirm__checks';
  for (const check of checks) {
    const li = document.createElement('li');
    li.className = check.ok
      ? 'analyze-download-confirm__check--ok'
      : 'analyze-download-confirm__check--warn';
    li.textContent = check.ok
      ? `${check.label}`
      : `${check.label} — ${check.reason}`;
    checkList.appendChild(li);
    if (!check.ok) hasBlocker = true;
  }
  card.appendChild(checkList);

  // Warning for cellular users
  if (!wifi.ok && wifi.reason) {
    const wifiWarn = document.createElement('p');
    wifiWarn.className = 'analyze-download-confirm__cellular-warn';
    wifiWarn.textContent = t('model.download.cellular_warning');
    card.appendChild(wifiWarn);
  }

  // Buttons
  const actions = document.createElement('div');
  actions.className = 'analyze-download-confirm__actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary';
  confirmBtn.textContent = hasBlocker
    ? t('model.download.confirm_anyway')
    : t('model.download.confirm_start');
  confirmBtn.addEventListener('click', onConfirm);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = t('nav.button.back');
  cancelBtn.addEventListener('click', onCancel);

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  card.appendChild(actions);

  container.appendChild(card);
}
