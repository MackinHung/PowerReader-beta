/**
 * PowerReader - Article Detail Page
 *
 * Full article view with bias visualization, controversy meter,
 * knowledge panel, cross-media cluster, and auto-analysis
 * with document switching support.
 *
 * Routes: #/article/{article_id}
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { fetchArticle, fetchArticleFeedbackStats, submitArticleFeedback, reportArticle } from '../api.js';
import { createControversyMeter } from '../components/controversy-badge.js';
import { createCampBar } from '../components/camp-bar.js';
import { enqueueAnalysis, cancelAnalysis, onQueueChange, getQueueStatus, AnalysisCancelledError } from '../model/queue.js';
import { renderResultPreview } from './analyze-result.js';
import { runPreAnalysisChecks } from './analyze-checks.js';
import { updateStatusUI } from './analyze-engine.js';
import { loadClusterPanel } from './article-panels.js';
import { getAutoRunnerStatus } from '../model/auto-runner.js';
import { scanGPU, getUserGPUSelection, saveUserGPUSelection } from '../model/benchmark.js';
import { getGPUOptionsForArch } from '../model/gpu-database.js';
import { formatVRAM } from './settings-helpers.js';
import { isMobileDevice } from '../utils/device-detect.js';
import { getAuthToken, isAuthenticated } from '../auth.js';
import { t } from '../../locale/zh-TW.js';

// ── Constants ──

const GPU_CONSENT_KEY = 'powerreader_gpu_consent';

// Source display names
const SOURCE_NAMES = {
  liberty_times: '自由時報', taiwan_apple_daily: '蘋果日報',
  china_times: '中國時報', united_daily_news: '聯合報',
  common_wealth: '天下雜誌', business_weekly: '商業週刊',
  the_news_lens: '關鍵評論網', the_reporter: '報導者',
  cna: '中央社', pts: '公視新聞',
  economic_daily_news: '經濟日報', commercial_times: '工商時報',
  inside: 'Inside', technews: '科技新報', ithome: 'iThome',
  rew_causas: '新新聞', storm_media: '風傳媒',
  '自由時報': '自由時報', '聯合報': '聯合報', '中央社': '中央社',
  '三立新聞': '三立新聞', 'ETtoday新聞雲': 'ETtoday新聞雲',
  '東森新聞': '東森新聞', '新頭殼': '新頭殼', '公視新聞': '公視新聞',
  '關鍵評論網': '關鍵評論網', '科技新報': '科技新報', '風傳媒': '風傳媒'
};

const CONTROVERSY_LABELS = {
  non_political: '非政治',
  general_policy: '一般政策',
  partisan_clash: '政黨交鋒',
  core_conflict: '核心對立',
  national_security: '國安外交'
};

// ── Module State ──

let _currentArticleId = null;
let _unsubscribeQueue = null;

function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('zh-TW', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return '';
  }
}

function getSourceName(sourceKey) {
  return SOURCE_NAMES[sourceKey] || sourceKey;
}

/**
 * Render article detail page.
 * @param {HTMLElement} container
 * @param {Object} params - Route params { hash: article_id }
 */
export async function renderArticle(container, params) {
  const articleId = params.hash;

  // Document switching: cancel previous analysis
  const previousId = _currentArticleId;
  if (previousId && previousId !== articleId) {
    cancelAnalysis(previousId);
  }
  _currentArticleId = articleId;

  if (_unsubscribeQueue) {
    _unsubscribeQueue();
    _unsubscribeQueue = null;
  }

  container.innerHTML = '';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.setAttribute('role', 'status');
  loadingEl.textContent = '載入中...';
  container.appendChild(loadingEl);

  const result = await fetchArticle(articleId);
  container.innerHTML = '';

  if (!result.success) {
    renderDetailError(container, result.error?.message || '系統錯誤，請稍後再試');
    return;
  }

  const article = result.data;
  renderArticleContent(container, article);

  loadFeedbackSection(container, articleId);
  loadClusterPanel(container, articleId);
  startAutoAnalysis(container, article);
}

// ── Article Content ──

function renderArticleContent(container, article) {
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--text article-detail__back';
  backBtn.textContent = '返回';
  backBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  container.appendChild(backBtn);

  const meta = document.createElement('div');
  meta.className = 'article-detail__meta';
  const sourceBadge = document.createElement('span');
  sourceBadge.className = 'article-card__source';
  sourceBadge.textContent = getSourceName(article.source);
  const dateEl = document.createElement('time');
  dateEl.className = 'article-detail__date';
  dateEl.setAttribute('datetime', article.published_at || '');
  dateEl.textContent = formatDate(article.published_at);
  meta.appendChild(sourceBadge);
  meta.appendChild(dateEl);
  container.appendChild(meta);

  const title = document.createElement('h2');
  title.className = 'article-detail__title';
  title.textContent = article.title || '';
  container.appendChild(title);

  if (article.camp_ratio) {
    const campData = typeof article.camp_ratio === 'string'
      ? JSON.parse(article.camp_ratio)
      : article.camp_ratio;
    const campSection = document.createElement('section');
    campSection.className = 'article-detail__camp';
    campSection.appendChild(createCampBar(campData));
    container.appendChild(campSection);
  }

  if (article.controversy_score != null && article.controversy_level) {
    const controversySection = document.createElement('section');
    controversySection.className = 'article-detail__controversy';
    const contHeading = document.createElement('h3');
    contHeading.className = 'section-heading';
    contHeading.textContent = CONTROVERSY_LABELS[article.controversy_level] || article.controversy_level;
    controversySection.appendChild(contHeading);
    controversySection.appendChild(createControversyMeter(article.controversy_score, article.controversy_level));
    container.appendChild(controversySection);
  }

  if (article.summary) {
    const summarySection = document.createElement('section');
    summarySection.className = 'article-detail__summary';
    const summaryText = document.createElement('p');
    summaryText.textContent = article.summary;
    summarySection.appendChild(summaryText);
    container.appendChild(summarySection);
  }

  if (article.url || article.primary_url) {
    const linkWrapper = document.createElement('div');
    linkWrapper.className = 'article-detail__actions';
    const link = document.createElement('a');
    link.className = 'btn btn--primary';
    link.href = article.url || article.primary_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '前往原文';
    link.setAttribute('aria-label', '在新視窗開啟原文連結');
    linkWrapper.appendChild(link);
    container.appendChild(linkWrapper);
  }

  // Feedback + Report section
  const feedbackSection = document.createElement('section');
  feedbackSection.id = 'feedback-section';
  feedbackSection.className = 'article-detail__feedback';
  feedbackSection.setAttribute('aria-label', '文章回饋');
  container.appendChild(feedbackSection);

  // Analysis section (replaces old analyze button)
  const analysisSection = document.createElement('section');
  analysisSection.id = 'analysis-section';
  analysisSection.className = 'article-detail__analysis';
  analysisSection.setAttribute('aria-label', '立場分析');
  container.appendChild(analysisSection);

  const clusterSlot = document.createElement('section');
  clusterSlot.id = 'cluster-panel';
  clusterSlot.className = 'article-detail__cluster';
  clusterSlot.setAttribute('aria-label', 'Cross-Media Comparison');
  container.appendChild(clusterSlot);
}

// ── Analysis (Manual Trigger) ──

async function startAutoAnalysis(container, article) {
  const section = container.querySelector('#analysis-section');
  if (!section) return;

  // Check if this article is already in the queue (auto-runner or manual)
  const queueStatus = getQueueStatus();
  const articleId = article.article_id;
  const isInQueue = (queueStatus.currentJob && queueStatus.currentJob.articleId === articleId)
    || queueStatus.pending.includes(articleId);

  if (isInQueue) {
    // Article already being analyzed — show live progress (dedup returns same promise)
    enqueueAndTrack(section, article);
    return;
  }

  // If auto-runner is active, show info banner with manual override
  const runnerStatus = getAutoRunnerStatus();
  if (runnerStatus.running) {
    _renderAutoRunnerBanner(section, article);
    return;
  }

  // Show manual analysis button (user clicks to start)
  renderManualAnalyzeButton(section, article);
}

/**
 * Show a prominent manual "分析此文章" button.
 * When clicked, runs pre-analysis checks and proceeds through gates.
 */
function renderManualAnalyzeButton(section, article) {
  section.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'article-detail__analyze-trigger';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = 'AI 立場分析';
  wrapper.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'analyze-trigger__desc';
  desc.textContent = '使用您的 GPU 在本機分析此文章的媒體立場與爭議程度';
  wrapper.appendChild(desc);

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary btn--large';
  btn.textContent = '分析此文章';
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = '檢查中...';
    proceedToAnalysis(section, article);
  });
  wrapper.appendChild(btn);

  section.appendChild(wrapper);
}

/**
 * Check if user has given one-time GPU consent.
 * @returns {boolean}
 */
export function isGPUConsentGiven() {
  return localStorage.getItem(GPU_CONSENT_KEY) === '1';
}

/**
 * Run pre-analysis checks and proceed through the single GPU consent gate.
 */
async function proceedToAnalysis(section, article) {
  const checks = await runPreAnalysisChecks(article);
  if (!checks.canAnalyze) {
    renderAnalysisBlocked(section, checks, article);
    return;
  }

  // Single gate: one-time GPU informed consent
  if (!isGPUConsentGiven()) {
    renderGPUConsent(section, article);
    return;
  }

  enqueueAndTrack(section, article);
}

/**
 * Show banner when auto-runner is active, with manual override button.
 */
function _renderAutoRunnerBanner(section, article) {
  section.innerHTML = '';

  const banner = document.createElement('div');
  banner.className = 'auto-runner-article-info';

  const text = document.createElement('span');
  text.className = 'auto-runner-article-info__text';
  text.textContent = '自動分析進行中';
  banner.appendChild(text);

  const overrideBtn = document.createElement('button');
  overrideBtn.className = 'btn btn--secondary';
  overrideBtn.textContent = '手動分析此文章';
  overrideBtn.addEventListener('click', () => {
    enqueueAndTrack(section, article);
  });
  banner.appendChild(overrideBtn);

  section.appendChild(banner);
}

function renderAnalysisBlocked(section, checks, article) {
  section.innerHTML = '';
  for (const issue of checks.issues) {
    const item = document.createElement('div');
    item.className = `analyze-blocked__item analyze-blocked__item--${issue.type}`;
    const msg = document.createElement('p');
    msg.textContent = issue.message;
    item.appendChild(msg);

    if (issue.type === 'auth') {
      const loginBtn = document.createElement('button');
      loginBtn.className = 'btn btn--primary';
      loginBtn.textContent = '使用 Google 帳號登入';
      loginBtn.addEventListener('click', () => {
        localStorage.setItem('powerreader_return_url', `#/article/${article.article_id}`);
        window.location.hash = '#/profile';
      });
      item.appendChild(loginBtn);
    }

    section.appendChild(item);
  }
}

/**
 * Render GPU consent card — single gate for first-time analysis.
 * Blocks mobile users and devices without WebGPU with clear messages.
 */
async function renderGPUConsent(section, article) {
  section.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'gpu-consent-card';

  const heading = document.createElement('h3');
  heading.className = 'gpu-consent-card__heading';
  heading.textContent = 'AI 本機分析說明';
  card.appendChild(heading);

  // ── Block: mobile device ──
  if (isMobileDevice()) {
    const msg = document.createElement('p');
    msg.className = 'gpu-consent-card__blocked';
    msg.textContent = '行動裝置不支援本機 AI 分析';
    card.appendChild(msg);

    const hint = document.createElement('p');
    hint.className = 'gpu-consent-card__hint';
    hint.textContent = '4.5GB 模型需要桌面電腦的 GPU 運算，請使用桌面瀏覽器';
    card.appendChild(hint);

    section.appendChild(card);
    return;
  }

  // ── Scan GPU ──
  const gpuInfo = await scanGPU();

  // ── Block: no WebGPU ──
  if (!gpuInfo.supported) {
    const msg = document.createElement('p');
    msg.className = 'gpu-consent-card__blocked';
    msg.textContent = '您的瀏覽器不支援 WebGPU';
    card.appendChild(msg);

    const hint = document.createElement('p');
    hint.className = 'gpu-consent-card__hint';
    hint.textContent = '請使用 Chrome 113+ 或 Edge 113+ 瀏覽器';
    card.appendChild(hint);

    section.appendChild(card);
    return;
  }

  // ── GPU info display ──
  const userOverride = getUserGPUSelection();

  if (userOverride) {
    card.appendChild(_gpuInfoRow('GPU', userOverride.device));
    card.appendChild(_gpuInfoRow('顯存', formatVRAM(userOverride.vramMB)));
  } else if (gpuInfo.device && gpuInfo.vramMB > 0) {
    card.appendChild(_gpuInfoRow('GPU', gpuInfo.device));
    card.appendChild(_gpuInfoRow('顯存', formatVRAM(gpuInfo.vramMB)));
  } else if (gpuInfo.archInfo) {
    card.appendChild(_gpuInfoRow('GPU', gpuInfo.archInfo.label + ' (' + gpuInfo.archInfo.series + ')'));
    card.appendChild(_gpuInfoRow('顯存', gpuInfo.archInfo.vramRange));

    // Inline GPU picker when device name is unknown
    _renderInlineGPUPicker(card, gpuInfo);
  } else {
    card.appendChild(_gpuInfoRow('GPU', gpuInfo.vendor || '未知'));
  }

  // ── Privacy & model info ──
  const modelHint = document.createElement('p');
  modelHint.className = 'gpu-consent-card__info';
  modelHint.textContent = '首次使用將下載約 4.5GB AI 模型至瀏覽器';
  card.appendChild(modelHint);

  const privacyHint = document.createElement('p');
  privacyHint.className = 'gpu-consent-card__info';
  privacyHint.textContent = '分析完全在您的裝置上執行，不上傳原文';
  card.appendChild(privacyHint);

  // ── Confirm button ──
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary btn--large';
  confirmBtn.textContent = '確認，開始分析';
  confirmBtn.addEventListener('click', () => {
    localStorage.setItem(GPU_CONSENT_KEY, '1');
    enqueueAndTrack(section, article);
  });
  card.appendChild(confirmBtn);

  section.appendChild(card);
}

function _gpuInfoRow(label, value) {
  const row = document.createElement('div');
  row.className = 'gpu-consent-card__row';
  const labelEl = document.createElement('span');
  labelEl.className = 'gpu-consent-card__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'gpu-consent-card__value';
  valueEl.textContent = value;
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function _renderInlineGPUPicker(card, gpuInfo) {
  const options = getGPUOptionsForArch(gpuInfo.architecture);
  if (!options || options.length === 0) return;

  const hint = document.createElement('p');
  hint.className = 'gpu-consent-card__picker-hint';
  hint.textContent = '可選擇您的 GPU 型號以優化體驗（非必要）';
  card.appendChild(hint);

  const select = document.createElement('select');
  select.className = 'gpu-consent-card__select';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- 選擇 GPU 型號 --';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  for (const gpu of options) {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ device: gpu.name, vramMB: gpu.vramMB });
    opt.textContent = gpu.name + ' (' + formatVRAM(gpu.vramMB) + ')';
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    if (!select.value) return;
    const chosen = JSON.parse(select.value);
    saveUserGPUSelection(chosen.device, chosen.vramMB);
  });
  card.appendChild(select);
}

function enqueueAndTrack(section, article) {
  const articleId = article.article_id;
  const startTime = Date.now();

  // Show initial waiting state
  renderWaitingStatus(section);

  // Subscribe to queue changes for position updates
  _unsubscribeQueue = onQueueChange((status) => {
    if (_currentArticleId !== articleId) return;
    const isRunning = status.currentJob && status.currentJob.articleId === articleId;
    const queuePos = status.pending.indexOf(articleId);
    if (!isRunning && queuePos >= 0) {
      renderWaitingStatus(section, queuePos + 1);
    }
  });

  enqueueAnalysis(articleId, article, {
    onStatus: (stage, elapsed, extra) => {
      if (_currentArticleId !== articleId) return;
      updateStatusUI(section, stage, Date.now() - startTime, extra);
    }
  })
    .then((result) => {
      if (_currentArticleId !== articleId) return;
      section.innerHTML = '';
      renderResultPreview(section, article, { ...result, analysis_duration_ms: Date.now() - startTime });
    })
    .catch((err) => {
      if (_currentArticleId !== articleId) return;
      if (err instanceof AnalysisCancelledError) return;
      renderAnalysisError(section, err, article);
    });
}

function renderWaitingStatus(section, position) {
  section.innerHTML = '';
  const msg = document.createElement('p');
  msg.className = 'analyze-status__message';
  msg.textContent = position
    ? `排隊等待中 (第 ${position} 順位)...`
    : '準備分析中...';
  section.appendChild(msg);

  const progress = document.createElement('div');
  progress.className = 'analyze-status__progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '內容載入中，請稍候');
  section.appendChild(progress);
}

function renderAnalysisError(section, err, article) {
  section.innerHTML = '';
  const errMsg = document.createElement('p');
  errMsg.className = 'error-state';
  errMsg.textContent = '分析失敗，正在切換至伺服器模式...';
  section.appendChild(errMsg);

  if (err.message) {
    const errDetail = document.createElement('p');
    errDetail.className = 'analyze-status__elapsed';
    errDetail.textContent = err.message;
    section.appendChild(errDetail);
  }

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--primary';
  retryBtn.textContent = '重試';
  retryBtn.addEventListener('click', () => { enqueueAndTrack(section, article); });
  section.appendChild(retryBtn);
}

// ── Error State ──

function renderDetailError(container, message) {
  const el = document.createElement('div');
  el.className = 'error-state';
  el.setAttribute('role', 'alert');

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--text';
  backBtn.textContent = '返回';
  backBtn.addEventListener('click', () => { window.location.hash = '#/'; });

  const text = document.createElement('p');
  text.textContent = message;

  el.appendChild(backBtn);
  el.appendChild(text);
  container.appendChild(el);
}

// ── Feedback + Report ──

const REPORT_REASONS = ['inaccurate', 'biased', 'spam', 'offensive', 'other'];

/**
 * Load and render feedback section (like/dislike + report).
 */
async function loadFeedbackSection(container, articleId) {
  const section = container.querySelector('#feedback-section');
  if (!section) return;

  section.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'feedback-bar';

  // Like button
  const likeBtn = document.createElement('button');
  likeBtn.className = 'feedback-btn feedback-btn--like';
  likeBtn.setAttribute('aria-label', t('feedback.like'));

  const likeIcon = document.createElement('span');
  likeIcon.className = 'feedback-btn__icon';
  likeIcon.textContent = '\u25B2'; // ▲
  const likeCount = document.createElement('span');
  likeCount.className = 'feedback-btn__count';
  likeCount.textContent = '0';
  likeBtn.appendChild(likeIcon);
  likeBtn.appendChild(likeCount);

  // Dislike button
  const dislikeBtn = document.createElement('button');
  dislikeBtn.className = 'feedback-btn feedback-btn--dislike';
  dislikeBtn.setAttribute('aria-label', t('feedback.dislike'));

  const dislikeIcon = document.createElement('span');
  dislikeIcon.className = 'feedback-btn__icon';
  dislikeIcon.textContent = '\u25BC'; // ▼
  const dislikeCountEl = document.createElement('span');
  dislikeCountEl.className = 'feedback-btn__count';
  dislikeCountEl.textContent = '0';
  dislikeBtn.appendChild(dislikeIcon);
  dislikeBtn.appendChild(dislikeCountEl);

  // Report button
  const reportBtn = document.createElement('button');
  reportBtn.className = 'feedback-btn feedback-btn--report';
  reportBtn.setAttribute('aria-label', t('report.button'));
  reportBtn.textContent = t('report.button');

  wrapper.appendChild(likeBtn);
  wrapper.appendChild(dislikeBtn);
  wrapper.appendChild(reportBtn);
  section.appendChild(wrapper);

  // Feedback message area
  const msgEl = document.createElement('p');
  msgEl.className = 'feedback-bar__message';
  msgEl.hidden = true;
  section.appendChild(msgEl);

  // Fetch current stats
  const stats = await fetchArticleFeedbackStats(articleId);
  if (stats.success && stats.data) {
    likeCount.textContent = String(stats.data.likes || 0);
    dislikeCountEl.textContent = String(stats.data.dislikes || 0);

    if (stats.data.user_feedback === 'like') {
      likeBtn.classList.add('feedback-btn--active');
    } else if (stats.data.user_feedback === 'dislike') {
      dislikeBtn.classList.add('feedback-btn--active');
    }
  }

  // Click handlers
  likeBtn.addEventListener('click', () => handleFeedbackClick(articleId, 'like', likeBtn, dislikeBtn, likeCount, dislikeCountEl, msgEl));
  dislikeBtn.addEventListener('click', () => handleFeedbackClick(articleId, 'dislike', likeBtn, dislikeBtn, likeCount, dislikeCountEl, msgEl));
  reportBtn.addEventListener('click', () => showReportDialog(articleId, 'article', msgEl));
}

async function handleFeedbackClick(articleId, type, likeBtn, dislikeBtn, likeCountEl, dislikeCountEl, msgEl) {
  if (!isAuthenticated()) {
    showFeedbackMessage(msgEl, t('feedback.login_required'), 'warning');
    return;
  }

  const token = getAuthToken();
  const result = await submitArticleFeedback(articleId, type, token);

  if (result.success) {
    showFeedbackMessage(msgEl, t('feedback.submit_success'), 'success');

    // Re-fetch stats to update counts
    const stats = await fetchArticleFeedbackStats(articleId);
    if (stats.success && stats.data) {
      likeCountEl.textContent = String(stats.data.likes || 0);
      dislikeCountEl.textContent = String(stats.data.dislikes || 0);

      likeBtn.classList.toggle('feedback-btn--active', stats.data.user_feedback === 'like');
      dislikeBtn.classList.toggle('feedback-btn--active', stats.data.user_feedback === 'dislike');
    }
  } else {
    const msg = result.error?.message || t('feedback.submit_error');
    showFeedbackMessage(msgEl, msg, 'error');
  }
}

function showFeedbackMessage(msgEl, text, type) {
  msgEl.textContent = text;
  msgEl.className = `feedback-bar__message feedback-bar__message--${type}`;
  msgEl.hidden = false;
  setTimeout(() => { msgEl.hidden = true; }, 3000);
}

/**
 * Show report dialog overlay.
 * @param {string} targetId - article_id or analysis_id
 * @param {'article'|'analysis'} targetType
 * @param {HTMLElement} msgEl - message element for feedback
 */
function showReportDialog(targetId, targetType, msgEl) {
  if (!isAuthenticated()) {
    showFeedbackMessage(msgEl, t('report.login_required'), 'warning');
    return;
  }

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'report-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('report.title'));

  const dialog = document.createElement('div');
  dialog.className = 'report-dialog';

  const heading = document.createElement('h3');
  heading.textContent = t('report.title');
  dialog.appendChild(heading);

  // Reason radio buttons
  const reasonGroup = document.createElement('div');
  reasonGroup.className = 'report-dialog__reasons';

  for (const reason of REPORT_REASONS) {
    const label = document.createElement('label');
    label.className = 'report-dialog__reason';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'report-reason';
    radio.value = reason;

    const text = document.createElement('span');
    text.textContent = t(`report.reason.${reason}`);

    label.appendChild(radio);
    label.appendChild(text);
    reasonGroup.appendChild(label);
  }
  dialog.appendChild(reasonGroup);

  // Description textarea
  const descInput = document.createElement('textarea');
  descInput.className = 'report-dialog__desc';
  descInput.placeholder = t('report.description_placeholder');
  descInput.rows = 3;
  descInput.maxLength = 500;
  dialog.appendChild(descInput);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'report-dialog__actions';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = t('report.submit');
  submitBtn.addEventListener('click', async () => {
    const selectedRadio = reasonGroup.querySelector('input[name="report-reason"]:checked');
    if (!selectedRadio) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    const token = getAuthToken();
    const desc = descInput.value.trim() || undefined;

    const apiFn = targetType === 'article' ? reportArticle : (await import('../api.js')).reportAnalysis;
    const result = await apiFn(targetId, selectedRadio.value, desc, token);

    overlay.remove();

    if (result.success) {
      showFeedbackMessage(msgEl, t('report.success'), 'success');
    } else if (result.error?.type === 'duplicate_report') {
      showFeedbackMessage(msgEl, t('report.duplicate'), 'warning');
    } else {
      showFeedbackMessage(msgEl, result.error?.message || t('report.error'), 'error');
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--text';
  cancelBtn.textContent = t('report.cancel');
  cancelBtn.addEventListener('click', () => overlay.remove());

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus first radio
  const firstRadio = reasonGroup.querySelector('input[type="radio"]');
  if (firstRadio) firstRadio.focus();
}

// Export for use by analyze-result.js
export { showReportDialog, showFeedbackMessage };
