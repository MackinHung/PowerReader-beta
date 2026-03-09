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

import { t } from '../../locale/zh-TW.js';
import { fetchArticle } from '../api.js';
import { createBiasBar } from '../components/bias-bar.js';
import { createControversyMeter } from '../components/controversy-badge.js';
import { createCampBar } from '../components/camp-bar.js';
import { enqueueAnalysis, cancelAnalysis, onQueueChange, getQueueStatus, AnalysisCancelledError } from '../model/queue.js';
import { renderResultPreview } from './analyze-result.js';
import { runPreAnalysisChecks } from './analyze-checks.js';
import { updateStatusUI } from './analyze-engine.js';
import { loadKnowledgePanel, loadClusterPanel } from './article-panels.js';
import { getAutoRunnerStatus } from '../model/auto-runner.js';
import { runPreDownloadChecks } from '../model/manager.js';

// ── Constants ──

const CONSENT_KEY = 'powerreader_auto_consent';

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
  const label = t(`source.name.${sourceKey}`);
  return label.startsWith('source.name.') ? sourceKey : label;
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
  loadingEl.textContent = t('common.label.loading');
  container.appendChild(loadingEl);

  const result = await fetchArticle(articleId);
  container.innerHTML = '';

  if (!result.success) {
    renderDetailError(container, result.error?.message || t('error.message.generic'));
    return;
  }

  const article = result.data;
  renderArticleContent(container, article);

  loadKnowledgePanel(container, articleId);
  loadClusterPanel(container, articleId);
  startAutoAnalysis(container, article);
}

// ── Article Content ──

function renderArticleContent(container, article) {
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--text article-detail__back';
  backBtn.textContent = t('nav.button.back');
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
    biasSection.setAttribute('aria-label', t('a11y.bias_bar', {
      score: article.bias_score,
      category: t(`bias.label.${article.bias_category}`)
    }));
    const biasHeading = document.createElement('h3');
    biasHeading.className = 'section-heading';
    biasHeading.textContent = t('nav.title.analyze');
    biasSection.appendChild(biasHeading);
    biasSection.appendChild(createBiasBar(article.bias_score, article.bias_category));
    container.appendChild(biasSection);
  }

  if (article.controversy_score != null && article.controversy_level) {
    const controversySection = document.createElement('section');
    controversySection.className = 'article-detail__controversy';
    const contHeading = document.createElement('h3');
    contHeading.className = 'section-heading';
    contHeading.textContent = t('controversy.badge.' + article.controversy_level);
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
    link.textContent = t('common.button.go_original');
    link.setAttribute('aria-label', t('a11y.button.go_original'));
    linkWrapper.appendChild(link);
    container.appendChild(linkWrapper);
  }

  // Analysis section (replaces old analyze button)
  const analysisSection = document.createElement('section');
  analysisSection.id = 'analysis-section';
  analysisSection.className = 'article-detail__analysis';
  analysisSection.setAttribute('aria-label', t('nav.title.analyze'));
  container.appendChild(analysisSection);

  const knowledgeSlot = document.createElement('section');
  knowledgeSlot.id = 'knowledge-panel';
  knowledgeSlot.className = 'article-detail__knowledge';
  knowledgeSlot.setAttribute('aria-label', 'Knowledge Panel');
  container.appendChild(knowledgeSlot);

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
  text.textContent = t('auto_runner.auto_in_progress');
  banner.appendChild(text);

  const overrideBtn = document.createElement('button');
  overrideBtn.className = 'btn btn--secondary';
  overrideBtn.textContent = t('auto_runner.override_button');
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
      loginBtn.textContent = t('login.google_oauth');
      loginBtn.addEventListener('click', () => {
        localStorage.setItem('powerreader_return_url', `#/article/${article.article_id}`);
        window.location.hash = '#/profile';
      });
      item.appendChild(loginBtn);
    }

    if (issue.type === 'benchmark_needed') {
      const benchBtn = document.createElement('button');
      benchBtn.className = 'btn btn--primary';
      benchBtn.textContent = t('settings.hw.btn_benchmark');
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
  heading.textContent = t('model.download.confirm_heading');
  section.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'analyze-download__subtitle';
  desc.textContent = t('model.download.confirm_desc');
  section.appendChild(desc);

  // Device condition checks
  const { checks } = await runPreDownloadChecks();
  const checkList = document.createElement('ul');
  checkList.className = 'analyze-download__checks';
  const checkLabels = {
    wifi: t('model.download.check_wifi'),
    battery: t('model.download.check_battery'),
    storage: t('model.download.check_storage')
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
  sizeHint.textContent = t('auto_analysis.download.size_hint');
  section.appendChild(sizeHint);

  // Warning if any check failed
  if (hasWarning) {
    const warn = document.createElement('p');
    warn.className = 'analyze-download__warning';
    warn.textContent = t('model.download.cellular_warning');
    section.appendChild(warn);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary';
  confirmBtn.textContent = t('model.download.confirm_start');
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
  heading.textContent = t('auto_analysis.consent.title');
  section.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'analyze-consent__desc';
  desc.textContent = t('auto_analysis.consent.desc');
  section.appendChild(desc);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary';
  confirmBtn.textContent = t('auto_analysis.consent.confirm');
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
    ? t('article.analyze.queued', { position })
    : t('article.analyze.waiting');
  section.appendChild(msg);

  const progress = document.createElement('div');
  progress.className = 'analyze-status__progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', t('a11y.status.loading'));
  section.appendChild(progress);
}

function renderAnalysisError(section, err, article) {
  section.innerHTML = '';
  const errMsg = document.createElement('p');
  errMsg.className = 'error-state';
  errMsg.textContent = t('error.model.inference_failed');
  section.appendChild(errMsg);

  if (err.message) {
    const errDetail = document.createElement('p');
    errDetail.className = 'analyze-status__elapsed';
    errDetail.textContent = err.message;
    section.appendChild(errDetail);
  }

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--primary';
  retryBtn.textContent = t('common.button.retry');
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
  backBtn.textContent = t('nav.button.back');
  backBtn.addEventListener('click', () => { window.location.hash = '#/'; });

  const text = document.createElement('p');
  text.textContent = message;

  el.appendChild(backBtn);
  el.appendChild(text);
  container.appendChild(el);
}
