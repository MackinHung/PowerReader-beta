/**
 * PowerReader - Analysis Result Preview & Submit
 *
 * Renders the analysis result for user review and handles submission
 * (online or offline queue via Background Sync).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { submitAnalysisResult } from '../api.js';
import { getModeLabel } from '../model/inference.js';
import { createBiasBar } from '../components/bias-bar.js';
import { createControversyMeter } from '../components/controversy-badge.js';
import { getAuthToken, getUserHash } from '../auth.js';
import { getBiasCategoryFromScore, getControversyLevelFromScore } from '../utils/score-categories.js';

/**
 * Render the analysis result preview with submit/retry buttons.
 */
export function renderResultPreview(container, article, result) {
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

  // Bias bar (prefer model-provided category, fallback to local mapping)
  if (result.bias_score != null) {
    const biasCategory = result.bias_category || getBiasCategoryFromScore(result.bias_score);
    container.appendChild(createBiasBar(result.bias_score, biasCategory));
  }

  // Controversy meter (prefer model-provided level, fallback to local mapping)
  if (result.controversy_score != null) {
    const contLevel = result.controversy_level || getControversyLevelFromScore(result.controversy_score);
    container.appendChild(createControversyMeter(result.controversy_score, contLevel));
  }

  // Narrative Points (Pass 2 output)
  if (result.points && result.points.length > 0) {
    const pointsSection = document.createElement('div');
    pointsSection.className = 'analyze-result__narrative';

    const pointsHeading = document.createElement('h4');
    pointsHeading.textContent = t('analyze.narrative_points');
    pointsSection.appendChild(pointsHeading);

    const pointsList = document.createElement('ol');
    pointsList.className = 'analyze-result__points-list';
    for (const point of result.points) {
      const li = document.createElement('li');
      li.textContent = point;
      pointsList.appendChild(li);
    }
    pointsSection.appendChild(pointsList);
    container.appendChild(pointsSection);
  }

  // Reasoning (fallback for server mode or legacy)
  if (!result.points?.length && result.reasoning) {
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

  // Key phrases (legacy, hidden if empty)
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

  // Debug panel: raw prompts and outputs
  if (result._debug) {
    const debugSection = document.createElement('details');
    debugSection.className = 'analyze-result__debug';

    const summary = document.createElement('summary');
    summary.textContent = 'Debug: Prompt & Raw Output';
    debugSection.appendChild(summary);

    const debugEntries = [
      { label: 'Pass 1 System Prompt', value: result._debug.pass1_system },
      { label: 'User Message (前500字)', value: result._debug.pass1_user },
      { label: 'Pass 1 Raw Output', value: result._debug.pass1_raw },
      { label: 'Pass 2 System Prompt', value: result._debug.pass2_system },
      { label: 'Pass 2 Raw Output', value: result._debug.pass2_raw },
      { label: 'Parsed Result', value: JSON.stringify({
        bias_score: result.bias_score,
        controversy_score: result.controversy_score,
        points: result.points,
        mode: result.mode,
        latency_ms: result.latency_ms
      }, null, 2) }
    ];

    for (const entry of debugEntries) {
      const dt = document.createElement('h4');
      dt.textContent = entry.label;
      dt.style.cssText = 'margin-top:12px;font-size:12px;color:#888;';
      debugSection.appendChild(dt);

      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;font-size:11px;background:#f5f5f5;padding:8px;border-radius:4px;max-height:200px;overflow:auto;';
      pre.textContent = entry.value || '(empty)';
      debugSection.appendChild(pre);
    }

    container.appendChild(debugSection);
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

/**
 * Submit the analysis result to the API (or queue offline).
 */
async function submitAnalysis(article, result, container) {
  const payload = {
    bias_score: result.bias_score,
    controversy_score: result.controversy_score,
    reasoning: result.reasoning || '',
    key_phrases: result.key_phrases || [],
    narrative_points: result.points || [],
    prompt_version: result.prompt_version || 'v3.0.0',
    analysis_duration_ms: result.latency_ms || 0,
    inference_mode: result.mode || 'unknown',
    user_hash: getUserHash() || ''
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

    const data = await submitAnalysisResult(
      article.article_id,
      payload,
      getAuthToken() || ''
    );

    if (data.success) {
      renderSubmitSuccess(container, false, data.data?.reward);
    } else {
      renderSubmitError(container, data.error?.message || t('error.message.generic'), article, result);
    }
  } catch (err) {
    renderSubmitError(container, t('error.network.offline'), article, result);
  }
}

function renderSubmitSuccess(container, isQueued, reward) {
  container.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'analyze-success';

  const text = document.createElement('p');
  text.textContent = isQueued ? t('pwa.sync.saved_offline') : t('analyze.submit_success');
  msg.appendChild(text);

  // Show reward feedback if points were awarded
  if (reward && reward.points_awarded_cents > 0) {
    const rewardCard = document.createElement('div');
    rewardCard.className = 'analyze-success__reward';

    const pointsAwarded = document.createElement('p');
    pointsAwarded.className = 'analyze-success__points';
    pointsAwarded.textContent = t('reward.points_awarded', {
      points: (reward.points_awarded_cents / 100).toFixed(2)
    });
    rewardCard.appendChild(pointsAwarded);

    const totalPoints = document.createElement('p');
    totalPoints.className = 'analyze-success__total';
    totalPoints.textContent = t('reward.total_points', {
      points: reward.display_points || '0.00'
    });
    rewardCard.appendChild(totalPoints);

    if (reward.vote_rights > 0) {
      const votes = document.createElement('p');
      votes.className = 'analyze-success__votes';
      votes.textContent = t('reward.vote_power', {
        votes: String(reward.vote_rights)
      });
      rewardCard.appendChild(votes);
    }

    msg.appendChild(rewardCard);
  }

  const actions = document.createElement('div');
  actions.className = 'analyze-success__actions';

  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn--primary';
  homeBtn.textContent = t('nav.button.home');
  homeBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  actions.appendChild(homeBtn);

  const profileBtn = document.createElement('button');
  profileBtn.className = 'btn btn--secondary';
  profileBtn.textContent = t('nav.title.profile');
  profileBtn.addEventListener('click', () => { window.location.hash = '#/profile'; });
  actions.appendChild(profileBtn);

  msg.appendChild(actions);
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
