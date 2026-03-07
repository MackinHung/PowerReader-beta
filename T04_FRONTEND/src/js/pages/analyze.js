/**
 * PowerReader - Analysis Page
 *
 * Allows users to run local AI bias analysis on articles.
 * Routes: #/analyze (selection prompt) or #/analyze/:hash (analyze article)
 *
 * Features:
 *   - Pre-check: model downloaded, cooldown, 72h deadline
 *   - Inference with live status updates
 *   - Result preview with confirm-then-submit
 *   - Offline queue via Background Sync
 */

import { t } from '../../locale/zh-TW.js';
import { fetchArticle } from '../api.js';
import { isModelDownloaded } from '../model/manager.js';
import { runAnalysis, detectBestMode, getModeLabel, INFERENCE_MODES, createInferenceTimer } from '../model/inference.js';
import { createBiasBar } from '../components/bias-bar.js';
import { createControversyMeter } from '../components/controversy-badge.js';
import { isAuthenticated, getAuthToken } from '../auth.js';

// Analysis deadline: 72 hours from publish
const DEADLINE_HOURS = 72;
// Cooldown: 60 minutes after 3 consecutive failures
const COOLDOWN_MINUTES = 60;

// =============================================
// Main Render
// =============================================

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
    renderBlockedState(container, checks, article);
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
// Pre-Analysis Checks
// =============================================

async function runPreAnalysisChecks(article) {
  const issues = [];

  // 1. Check model downloaded
  const modelReady = await isModelDownloaded();
  const bestMode = await detectBestMode();

  // Model not needed if server mode
  if (!modelReady && bestMode !== INFERENCE_MODES.SERVER) {
    issues.push({ type: 'model', message: t('error.model.not_downloaded') });
  }

  // 2. Check cooldown
  const cooldown = getCooldownState();
  if (cooldown.active) {
    issues.push({
      type: 'cooldown',
      message: t('reward.cooldown.active'),
      remaining: cooldown.remainingMinutes
    });
  }

  // 3. Check 72h deadline
  if (article.published_at) {
    const publishTime = new Date(article.published_at).getTime();
    const deadlineTime = publishTime + DEADLINE_HOURS * 60 * 60 * 1000;
    const remaining = deadlineTime - Date.now();

    if (remaining <= 0) {
      issues.push({ type: 'deadline', message: t('article.deadline.expired') });
    }
  }

  // 4. Check login (required for analysis submission)
  if (!isAuthenticated()) {
    issues.push({ type: 'auth', message: t('login.prompt') });
  }

  return {
    canAnalyze: issues.length === 0,
    issues,
    modelReady,
    bestMode
  };
}

function getCooldownState() {
  const cooldownUntil = localStorage.getItem('powerreader_cooldown_until');
  if (!cooldownUntil) return { active: false };

  const until = parseInt(cooldownUntil, 10);
  const remaining = until - Date.now();
  if (remaining <= 0) {
    localStorage.removeItem('powerreader_cooldown_until');
    return { active: false };
  }

  return {
    active: true,
    remainingMinutes: Math.ceil(remaining / 60000)
  };
}

// =============================================
// Blocked State
// =============================================

function renderBlockedState(container, checks, article) {
  const wrapper = document.createElement('div');
  wrapper.className = 'analyze-blocked';

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = t('nav.title.analyze');
  wrapper.appendChild(heading);

  const articleTitle = document.createElement('h3');
  articleTitle.textContent = article.title || '';
  wrapper.appendChild(articleTitle);

  for (const issue of checks.issues) {
    const item = document.createElement('div');
    item.className = `analyze-blocked__item analyze-blocked__item--${issue.type}`;

    const msg = document.createElement('p');
    msg.textContent = issue.message;
    item.appendChild(msg);

    // Cooldown timer
    if (issue.type === 'cooldown' && issue.remaining) {
      const timer = document.createElement('p');
      timer.className = 'cooldown-timer';
      timer.textContent = t('reward.cooldown.remaining', { minutes: issue.remaining });
      item.appendChild(timer);

      // Live countdown
      const intervalId = setInterval(() => {
        const state = getCooldownState();
        if (!state.active) {
          clearInterval(intervalId);
          timer.textContent = '';
          // Re-render
          renderAnalyze(container, { hash: article.article_id });
        } else {
          timer.textContent = t('reward.cooldown.remaining', { minutes: state.remainingMinutes });
        }
      }, 60000);
    }

    // Model not downloaded — show download button
    if (issue.type === 'model') {
      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn btn--primary';
      dlBtn.textContent = t('model.download.button');
      dlBtn.addEventListener('click', () => { window.location.hash = '#/settings'; });
      item.appendChild(dlBtn);
    }

    // Not logged in — show login button
    if (issue.type === 'auth') {
      const loginBtn = document.createElement('button');
      loginBtn.className = 'btn btn--primary';
      loginBtn.textContent = t('login.google_oauth');
      loginBtn.addEventListener('click', () => {
        // Store return URL for post-login redirect
        localStorage.setItem('powerreader_return_url', `#/analyze/${article.article_id}`);
        window.location.hash = '#/profile';
      });
      item.appendChild(loginBtn);
    }

    wrapper.appendChild(item);
  }

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--text';
  backBtn.textContent = t('nav.button.back');
  backBtn.addEventListener('click', () => { window.location.hash = `#/article/${article.article_id}`; });
  wrapper.appendChild(backBtn);

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

  // Start analysis button
  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn--primary analyze-start-btn';
  startBtn.textContent = t('common.button.start_analysis');
  startBtn.setAttribute('aria-label', t('a11y.button.analyze'));
  wrapper.appendChild(startBtn);

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
    startBtn.disabled = true;
    startBtn.hidden = true;
    statusArea.hidden = false;
    await executeAnalysis(article, statusArea, resultArea);
  });

  container.appendChild(wrapper);
}

// =============================================
// Execute Analysis
// =============================================

async function executeAnalysis(article, statusArea, resultArea) {
  const timer = createInferenceTimer((stage, elapsed) => {
    updateStatusUI(statusArea, stage, elapsed);
  });
  timer.start();

  try {
    const result = await runAnalysis({
      articleContent: article.content_markdown || article.summary || '',
      knowledgeEntries: [],
      onStatus: (stage, elapsed) => {
        updateStatusUI(statusArea, stage, elapsed);
      }
    });

    timer.cancel();
    statusArea.hidden = true;
    resultArea.hidden = false;

    renderResultPreview(resultArea, article, result);
  } catch (err) {
    timer.cancel();
    statusArea.innerHTML = '';

    const errMsg = document.createElement('p');
    errMsg.className = 'error-state';
    errMsg.textContent = t('error.model.inference_failed');
    statusArea.appendChild(errMsg);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn--primary';
    retryBtn.textContent = t('common.button.retry');
    retryBtn.addEventListener('click', () => {
      statusArea.innerHTML = '';
      executeAnalysis(article, statusArea, resultArea);
    });
    statusArea.appendChild(retryBtn);
  }
}

function updateStatusUI(statusArea, stage, elapsedMs) {
  statusArea.innerHTML = '';

  const stageMessages = {
    preparing: t('model.inference.preparing'),
    running: t('model.inference.running'),
    generating: t('model.inference.generating'),
    slow_hint: t('model.inference.slow_hint'),
    timeout_offer: t('model.inference.timeout_offer'),
    fallback_to_server: t('error.model.inference_failed')
  };

  const msg = document.createElement('p');
  msg.className = 'analyze-status__message';
  msg.textContent = stageMessages[stage] || t('model.inference.running');
  statusArea.appendChild(msg);

  // Progress animation
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

  // Server switch button after timeout
  if (stage === 'timeout_offer') {
    const switchBtn = document.createElement('button');
    switchBtn.className = 'btn btn--secondary';
    switchBtn.textContent = t('model.inference.switch_server');
    switchBtn.addEventListener('click', () => {
      // Re-run with server mode forced
      // This requires cancelling current inference — simplified here
      statusArea.innerHTML = '';
      const msg2 = document.createElement('p');
      msg2.textContent = t('model.inference.running');
      statusArea.appendChild(msg2);
    });
    statusArea.appendChild(switchBtn);
  }
}

// =============================================
// Result Preview + Submit
// =============================================

function renderResultPreview(container, article, result) {
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('analyze.result_preview');
  container.appendChild(heading);

  // Mode indicator
  const modeLabel = document.createElement('p');
  modeLabel.className = 'analyze-result__mode';
  modeLabel.textContent = `${getModeLabel(result.mode)} | ${Math.round(result.latency_ms / 1000)}s`;
  container.appendChild(modeLabel);

  // Bias bar
  if (result.bias_score != null) {
    const biasCategory = getBiasCategoryFromScore(result.bias_score);
    container.appendChild(createBiasBar(result.bias_score, biasCategory));
  }

  // Controversy meter
  if (result.controversy_score != null) {
    const contLevel = getControversyLevelFromScore(result.controversy_score);
    container.appendChild(createControversyMeter(result.controversy_score, contLevel));
  }

  // Reasoning
  if (result.reasoning) {
    const reasonSection = document.createElement('div');
    reasonSection.className = 'analyze-result__reasoning';

    const reasonHeading = document.createElement('h4');
    reasonHeading.textContent = t('analyze.reasoning');
    reasonSection.appendChild(reasonHeading);

    const reasonText = document.createElement('p');
    reasonText.textContent = result.reasoning;
    reasonSection.appendChild(reasonText);

    container.appendChild(reasonSection);
  }

  // Key phrases
  if (result.key_phrases && result.key_phrases.length > 0) {
    const phrasesSection = document.createElement('div');
    phrasesSection.className = 'analyze-result__phrases';

    const phrasesHeading = document.createElement('h4');
    phrasesHeading.textContent = t('analyze.key_phrases');
    phrasesSection.appendChild(phrasesHeading);

    const phrasesList = document.createElement('div');
    phrasesList.className = 'analyze-result__phrases-list';
    for (const phrase of result.key_phrases) {
      const tag = document.createElement('span');
      tag.className = 'phrase-tag';
      tag.textContent = phrase;
      phrasesList.appendChild(tag);
    }
    phrasesSection.appendChild(phrasesList);
    container.appendChild(phrasesSection);
  }

  // Action buttons: Submit or Retry
  const actions = document.createElement('div');
  actions.className = 'analyze-result__actions';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = t('common.button.submit');
  submitBtn.addEventListener('click', () => submitAnalysis(article, result, container));

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--secondary';
  retryBtn.textContent = t('common.button.retry');
  retryBtn.addEventListener('click', () => {
    window.location.hash = `#/analyze/${article.article_id}`;
  });

  actions.appendChild(submitBtn);
  actions.appendChild(retryBtn);
  container.appendChild(actions);
}

// =============================================
// Submit Analysis
// =============================================

async function submitAnalysis(article, result, container) {
  const payload = {
    bias_score: result.bias_score,
    controversy_score: result.controversy_score,
    reasoning: result.reasoning,
    key_phrases: result.key_phrases,
    prompt_version: 'v1.0',
    user_hash: localStorage.getItem('powerreader_user_hash') || ''
  };

  try {
    if (!navigator.onLine) {
      // Queue for Background Sync
      const { openDB } = await import('../db.js');
      const db = await openDB();
      const tx = db.transaction('pending_sync', 'readwrite');
      tx.objectStore('pending_sync').add({
        type: 'analysis',
        article_id: article.article_id,
        payload,
        created_at: new Date().toISOString(),
        retry_count: 0
      });
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      db.close();

      renderSubmitSuccess(container, true);
      return;
    }

    const response = await fetch(`/api/v1/articles/${encodeURIComponent(article.article_id)}/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken() || ''}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();

    if (data.success) {
      renderSubmitSuccess(container, false);
    } else {
      renderSubmitError(container, data.error?.message || t('error.message.generic'), article, result);
    }
  } catch (err) {
    renderSubmitError(container, t('error.network.offline'), article, result);
  }
}

function renderSubmitSuccess(container, isQueued) {
  container.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'analyze-success';

  const text = document.createElement('p');
  text.textContent = isQueued ? t('pwa.sync.saved_offline') : t('analyze.submit_success');
  msg.appendChild(text);

  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn--primary';
  homeBtn.textContent = t('nav.button.home');
  homeBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  msg.appendChild(homeBtn);

  container.appendChild(msg);
}

function renderSubmitError(container, message, article, result) {
  container.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'error-state';

  const text = document.createElement('p');
  text.textContent = message;
  msg.appendChild(text);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--primary';
  retryBtn.textContent = t('common.button.retry');
  retryBtn.addEventListener('click', () => submitAnalysis(article, result, container));
  msg.appendChild(retryBtn);

  container.appendChild(msg);
}

// =============================================
// Deadline Indicator
// =============================================

function createDeadlineIndicator(publishedAt) {
  const publishTime = new Date(publishedAt).getTime();
  const deadlineTime = publishTime + DEADLINE_HOURS * 60 * 60 * 1000;
  const remaining = deadlineTime - Date.now();

  if (remaining <= 0) {
    const el = document.createElement('span');
    el.className = 'deadline-indicator deadline-indicator--expired';
    el.textContent = t('article.deadline.expired');
    return el;
  }

  const remainingHours = Math.floor(remaining / (60 * 60 * 1000));
  const el = document.createElement('span');

  if (remainingHours <= 12) {
    el.className = 'deadline-indicator deadline-indicator--warning';
    el.textContent = t('article.deadline.warning', { hours: remainingHours });
  } else {
    el.className = 'deadline-indicator deadline-indicator--active';
    el.textContent = t('article.deadline.remaining', { hours: remainingHours });
  }

  return el;
}

// =============================================
// Helpers: Score → Category (client-side mapping)
// Boundaries from shared/config.js ANALYSIS
// =============================================

function getBiasCategoryFromScore(score) {
  if (score < 5) return 'extreme_left';
  if (score < 40) return 'left';
  if (score < 48) return 'center_left';
  if (score <= 52) return 'center';
  if (score <= 60) return 'center_right';
  if (score <= 95) return 'right';
  return 'extreme_right';
}

function getControversyLevelFromScore(score) {
  if (score < 5) return 'low';
  if (score < 15) return 'moderate';
  if (score < 50) return 'high';
  return 'very_high';
}
