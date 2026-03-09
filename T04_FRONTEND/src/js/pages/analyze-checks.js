/**
 * PowerReader - Analysis Pre-checks & Blocked State
 *
 * Validates preconditions before analysis:
 * model downloaded, cooldown, 72h deadline, auth.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { detectBestMode, INFERENCE_MODES } from '../model/inference.js';
import { isAuthenticated } from '../auth.js';
import { getCachedBenchmark, scanGPU } from '../model/benchmark.js';

// Analysis deadline: 72 hours from publish
const DEADLINE_HOURS = 72;
const MIN_VRAM_MB = 4500;

/**
 * Run all pre-analysis checks and return {canAnalyze, issues, modelReady, bestMode}.
 */
export async function runPreAnalysisChecks(article) {
  const issues = [];

  // 0. GPU capability gate (before model check)
  const benchmark = getCachedBenchmark();
  const gpuInfo = await scanGPU();

  if (!gpuInfo.supported) {
    issues.push({ type: 'gpu', message: t('auto_analysis.error.no_webgpu') });
  } else if (benchmark && benchmark.mode === 'none') {
    issues.push({ type: 'gpu', message: t('auto_analysis.error.vram_insufficient') });
  } else if (!benchmark && gpuInfo.vramMB > 0 && gpuInfo.vramMB < MIN_VRAM_MB) {
    issues.push({ type: 'gpu', message: t('auto_analysis.error.vram_insufficient') });
  } else if (!benchmark && gpuInfo.vramMB === 0) {
    issues.push({ type: 'benchmark_needed', message: t('auto_analysis.error.benchmark_needed') });
  }

  // 1. Check model / inference mode
  const bestMode = await detectBestMode();

  // WebGPU mode: WebLLM handles model download automatically via CreateMLCEngine()
  // with progress callback — no pre-download step needed.
  // Server mode: no local model needed.
  // Only block if NO inference mode is available (no WebGPU + no server).
  const modelReady = bestMode === INFERENCE_MODES.WEBGPU || bestMode === INFERENCE_MODES.SERVER;
  if (!modelReady) {
    issues.push({ type: 'model', message: t('error.webgpu.not_supported') });
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

  return { canAnalyze: issues.length === 0, issues, modelReady, bestMode };
}

/**
 * Get cooldown state from localStorage.
 */
export function getCooldownState() {
  const cooldownUntil = localStorage.getItem('powerreader_cooldown_until');
  if (!cooldownUntil) return { active: false };

  const until = parseInt(cooldownUntil, 10);
  const remaining = until - Date.now();
  if (remaining <= 0) {
    localStorage.removeItem('powerreader_cooldown_until');
    return { active: false };
  }

  return { active: true, remainingMinutes: Math.ceil(remaining / 60000) };
}

/**
 * Render the blocked state UI when pre-checks fail.
 */
export function renderBlockedState(container, checks, article, reRender) {
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

      const intervalId = setInterval(() => {
        const state = getCooldownState();
        if (!state.active) {
          clearInterval(intervalId);
          timer.textContent = '';
          reRender();
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

    // GPU not supported — informational only
    // (no action button, just a message)

    // Benchmark needed — show settings button
    if (issue.type === 'benchmark_needed') {
      const benchBtn = document.createElement('button');
      benchBtn.className = 'btn btn--primary';
      benchBtn.textContent = t('settings.hw.btn_benchmark');
      benchBtn.addEventListener('click', () => { window.location.hash = '#/settings'; });
      item.appendChild(benchBtn);
    }

    // Not logged in — show login button
    if (issue.type === 'auth') {
      const loginBtn = document.createElement('button');
      loginBtn.className = 'btn btn--primary';
      loginBtn.textContent = t('login.google_oauth');
      loginBtn.addEventListener('click', () => {
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
