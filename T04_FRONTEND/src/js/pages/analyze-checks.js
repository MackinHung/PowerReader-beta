/**
 * PowerReader - Analysis Pre-checks & Blocked State
 *
 * Validates preconditions before analysis:
 * model downloaded, cooldown, 72h deadline, auth.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { detectBestMode, INFERENCE_MODES } from '../model/inference.js';
import { isAuthenticated } from '../auth.js';

// Analysis deadline: 72 hours from publish
const DEADLINE_HOURS = 72;

/**
 * Run all pre-analysis checks and return {canAnalyze, issues, modelReady, bestMode}.
 *
 * Simplified: no benchmark gate. If WebGPU exists, let the user try.
 * WebLLM will report a clear error if the GPU can't handle it.
 */
export async function runPreAnalysisChecks(article) {
  const issues = [];

  // 0a. Check if article already has an analysis (global one-per-article limit)
  if (article.analysis_count > 0) {
    issues.push({ type: 'already_analyzed', message: '此文章已被分析過，每篇文章僅能分析一次' });
  }

  // 0. Check model / inference mode
  const bestMode = await detectBestMode();

  // WebGPU mode: WebLLM handles model download automatically via CreateMLCEngine()
  // with progress callback — no pre-download step needed.
  // Server mode: no local model needed.
  // Only block if NO inference mode is available (no WebGPU + no server).
  const modelReady = bestMode === INFERENCE_MODES.WEBGPU || bestMode === INFERENCE_MODES.SERVER;
  if (!modelReady) {
    issues.push({ type: 'model', message: '您的瀏覽器不支援 WebGPU，無法執行本機分析' });
  }

  // 1. Check cooldown
  const cooldown = getCooldownState();
  if (cooldown.active) {
    issues.push({
      type: 'cooldown',
      message: '分析冷卻中，請稍後再試',
      remaining: cooldown.remainingMinutes
    });
  }

  // 2. Check 72h deadline
  if (article.published_at) {
    const publishTime = new Date(article.published_at).getTime();
    const deadlineTime = publishTime + DEADLINE_HOURS * 60 * 60 * 1000;
    const remaining = deadlineTime - Date.now();

    if (remaining <= 0) {
      issues.push({ type: 'deadline', message: '此文章已超過 72 小時分析期限' });
    }
  }

  // 3. Check login (required for analysis submission)
  if (!isAuthenticated()) {
    issues.push({ type: 'auth', message: '請先登入以提交分析結果' });
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
  heading.textContent = '立場分析';
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
      timer.textContent = `冷卻中，${issue.remaining} 分鐘後可再次分析`;
      item.appendChild(timer);

      const intervalId = setInterval(() => {
        const state = getCooldownState();
        if (!state.active) {
          clearInterval(intervalId);
          timer.textContent = '';
          reRender();
        } else {
          timer.textContent = `冷卻中，${state.remainingMinutes} 分鐘後可再次分析`;
        }
      }, 60000);
    }

    // Not logged in — show login button
    if (issue.type === 'auth') {
      const loginBtn = document.createElement('button');
      loginBtn.className = 'btn btn--primary';
      loginBtn.textContent = '使用 Google 帳號登入';
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
  backBtn.textContent = '返回';
  backBtn.addEventListener('click', () => { window.location.hash = `#/article/${article.article_id}`; });
  wrapper.appendChild(backBtn);

  container.appendChild(wrapper);
}
