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

import { fetchArticle } from '../api.js';
import { createBiasBar } from '../components/bias-bar.js';
import { createControversyMeter } from '../components/controversy-badge.js';
import { createCampBar } from '../components/camp-bar.js';
import { enqueueAnalysis, cancelAnalysis, onQueueChange, getQueueStatus, AnalysisCancelledError } from '../model/queue.js';
import { renderResultPreview } from './analyze-result.js';
import { runPreAnalysisChecks } from './analyze-checks.js';
import { updateStatusUI } from './analyze-engine.js';
import { loadClusterPanel } from './article-panels.js';
import { getAutoRunnerStatus } from '../model/auto-runner.js';
import { runPreDownloadChecks } from '../model/manager.js';

// ── Constants ──

const CONSENT_KEY = 'powerreader_auto_consent';

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

const BIAS_LABELS = {
  extreme_left: '極左', left: '偏左', center_left: '中間偏左',
  center: '中立', center_right: '中間偏右', right: '偏右', extreme_right: '極右'
};

const CONTROVERSY_BADGES = {
  low: '低度爭議', moderate: '中等爭議', high: '高度爭議', very_high: '極高爭議'
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

  if (article.bias_score != null && article.bias_category) {
    const biasSection = document.createElement('section');
    biasSection.className = 'article-detail__bias';
    biasSection.setAttribute('aria-label', `立場分析光譜條，分數 ${article.bias_score}，分類 ${BIAS_LABELS[article.bias_category] || article.bias_category}`);
    const biasHeading = document.createElement('h3');
    biasHeading.className = 'section-heading';
    biasHeading.textContent = '立場分析';
    biasSection.appendChild(biasHeading);
    biasSection.appendChild(createBiasBar(article.bias_score, article.bias_category));
    container.appendChild(biasSection);
  }

  if (article.controversy_score != null && article.controversy_level) {
    const controversySection = document.createElement('section');
    controversySection.className = 'article-detail__controversy';
    const contHeading = document.createElement('h3');
    contHeading.className = 'section-heading';
    contHeading.textContent = CONTROVERSY_BADGES[article.controversy_level] || article.controversy_level;
    controversySection.appendChild(contHeading);
    controversySection.appendChild(createControversyMeter(article.controversy_score, article.controversy_level));
    container.appendChild(controversySection);
  }

  if (article.camp_ratio) {
    const campSection = document.createElement('section');
    campSection.className = 'article-detail__camp';
    campSection.appendChild(createCampBar(article.camp_ratio));
    container.appendChild(campSection);
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

// ── Auto-Analysis ──

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

  // If auto-runner is active, show info banner instead of auto-enqueuing
  const runnerStatus = getAutoRunnerStatus();
  if (runnerStatus.running) {
    _renderAutoRunnerBanner(section, article);
    return;
  }

  const checks = await runPreAnalysisChecks(article);
  if (!checks.canAnalyze) {
    renderAnalysisBlocked(section, checks, article);
    return;
  }

  // First-time download confirmation
  if (localStorage.getItem('powerreader_webllm_cached') !== '1') {
    renderDownloadConfirmation(section, article);
    return;
  }

  // One-time consent dialog
  if (localStorage.getItem(CONSENT_KEY) !== '1') {
    renderConsentDialog(section, article);
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

    if (issue.type === 'benchmark_needed') {
      const benchBtn = document.createElement('button');
      benchBtn.className = 'btn btn--primary';
      benchBtn.textContent = '執行效能測試';
      benchBtn.addEventListener('click', () => { window.location.hash = '#/settings'; });
      item.appendChild(benchBtn);
    }

    section.appendChild(item);
  }
}

async function renderDownloadConfirmation(section, article) {
  section.innerHTML = '';
  const heading = document.createElement('h3');
  heading.className = 'analyze-download__heading';
  heading.textContent = '首次使用需下載 AI 模型';
  section.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'analyze-download__subtitle';
  desc.textContent = '分析功能需要下載約 4.5GB 的 AI 模型至瀏覽器，下載後可離線使用。建議使用 WiFi 下載。';
  section.appendChild(desc);

  // Device condition checks
  const { checks } = await runPreDownloadChecks();
  const checkList = document.createElement('ul');
  checkList.className = 'analyze-download__checks';
  const checkLabels = {
    wifi: '網路連線',
    battery: '電量充足',
    storage: '儲存空間'
  };
  let hasWarning = false;
  for (const check of checks) {
    const li = document.createElement('li');
    const icon = check.ok ? '\u2705' : '\u274C';
    li.textContent = `${icon} ${checkLabels[check.name] || check.name}`;
    if (!check.ok) {
      li.className = 'analyze-download__check--warn';
      hasWarning = true;
    }
    checkList.appendChild(li);
  }
  section.appendChild(checkList);

  // Size hint
  const sizeHint = document.createElement('p');
  sizeHint.className = 'analyze-download__size-hint';
  sizeHint.textContent = '模型大小: 約 4.5GB';
  section.appendChild(sizeHint);

  // Warning if any check failed
  if (hasWarning) {
    const warn = document.createElement('p');
    warn.className = 'analyze-download__warning';
    warn.textContent = '偵測到行動網路連線，下載 4.5GB 模型可能產生大量數據費用。';
    section.appendChild(warn);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary';
  confirmBtn.textContent = '確認下載並分析';
  confirmBtn.addEventListener('click', () => { enqueueAndTrack(section, article); });
  section.appendChild(confirmBtn);
}

/**
 * One-time consent dialog explaining auto GPU analysis.
 */
function renderConsentDialog(section, article) {
  section.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'analyze-consent__heading';
  heading.textContent = '自動分析說明';
  section.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'analyze-consent__desc';
  desc.textContent = 'PowerReader 會使用您的 GPU 自動分析文章立場。過程約 15 秒，完全在您的裝置上執行，不會上傳原文。';
  section.appendChild(desc);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary';
  confirmBtn.textContent = '了解，開始分析';
  confirmBtn.addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, '1');
    enqueueAndTrack(section, article);
  });
  section.appendChild(confirmBtn);
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
