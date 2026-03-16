/**
 * PowerReader - Analysis Result Preview & Submit
 *
 * Renders the analysis result for user review and handles submission
 * (online or offline queue via Background Sync).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { submitAnalysisResult, fetchAnalysisFeedbackStats, submitAnalysisFeedback, reportAnalysis } from '../api.js';
import { getModeLabel } from '../model/inference.js';
import { createControversyMeter } from '../components/controversy-badge.js';
import { createCampBar } from '../components/camp-bar.js';
import { getAuthToken, getUserHash, isAuthenticated } from '../auth.js';
import { getControversyLevelFromScore } from '../utils/score-categories.js';
import { t } from '../../locale/zh-TW.js';

/**
 * Render the analysis result preview with submit/retry buttons.
 */
export function renderResultPreview(container, article, result) {
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = '分析結果預覽';
  container.appendChild(heading);

  // Mode indicator
  const modeLabel = document.createElement('p');
  modeLabel.className = 'analyze-result__mode';
  modeLabel.textContent = `${getModeLabel(result.mode)} | ${Math.round(result.latency_ms / 1000)}s`;
  container.appendChild(modeLabel);

  // Camp ratio bar (three-camp stacked bar) — replaces bias spectrum bar
  if (result.camp_ratio) {
    container.appendChild(createCampBar(result.camp_ratio));
  }

  // Controversy meter (prefer model-provided level, fallback to local mapping)
  if (result.controversy_score != null) {
    const contLevel = result.controversy_level || getControversyLevelFromScore(result.controversy_score);
    container.appendChild(createControversyMeter(result.controversy_score, contLevel));
  }

  // Narrative Points (Pass 2 output) with knowledge linking
  if (result.points && result.points.length > 0) {
    const knowledgeEntries = result.knowledgeEntries || [];
    const highRelevanceEntries = knowledgeEntries.filter(e => (e.score || 0) >= 0.7);

    const pointsSection = document.createElement('details');
    pointsSection.className = 'analyze-result__narrative-collapsible';

    const pointsHeading = document.createElement('summary');
    pointsHeading.textContent = '查看 AI 論述重點 (僅供參考)';
    pointsSection.appendChild(pointsHeading);

    const disclaimer = document.createElement('p');
    disclaimer.className = 'analyze-result__disclaimer';
    disclaimer.textContent = '以下分析由您的瀏覽器本機 AI 模型產生，不代表本平台觀點。AI 可能產生不準確的判斷，請以原文為準。';
    pointsSection.appendChild(disclaimer);

    const pointsList = document.createElement('ol');
    pointsList.className = 'analyze-result__points-list';
    for (const point of result.points) {
      const li = document.createElement('li');
      li.className = 'analyze-result__point';

      const pointText = document.createElement('span');
      pointText.textContent = point;
      li.appendChild(pointText);

      // Link matching high-relevance knowledge entries to this point
      const matched = findMatchingKnowledge(point, highRelevanceEntries);
      if (matched.length > 0) {
        const refContainer = document.createElement('span');
        refContainer.className = 'analyze-result__knowledge-refs';
        for (const entry of matched) {
          const badge = document.createElement('span');
          badge.className = `knowledge-ref-badge knowledge-badge--${entry.type}`;
          badge.textContent = entry.title || getKnowledgeTypeLabel(entry.type);
          badge.title = entry.snippet || '';
          refContainer.appendChild(badge);
        }
        li.appendChild(refContainer);
      }

      pointsList.appendChild(li);
    }
    pointsSection.appendChild(pointsList);
    container.appendChild(pointsSection);
  }

  // Reasoning (fallback for server mode or legacy)
  if (!result.points?.length && result.reasoning) {
    const reasonSection = document.createElement('details');
    reasonSection.className = 'analyze-result__reasoning-collapsible';

    const reasonHeading = document.createElement('summary');
    reasonHeading.textContent = '查看分析推理 (僅供參考)';
    reasonSection.appendChild(reasonHeading);

    const disclaimer = document.createElement('p');
    disclaimer.className = 'analyze-result__disclaimer';
    disclaimer.textContent = '以下分析由您的瀏覽器本機 AI 模型產生，不代表本平台觀點。AI 可能產生不準確的判斷，請以原文為準。';
    reasonSection.appendChild(disclaimer);

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
    phrasesHeading.textContent = '關鍵詞';
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

  // Transparency panel: structured L1/L2/L3 analysis basis
  container.appendChild(renderTransparencyPanel(result));

  // Action buttons: Submit or Retry
  const actions = document.createElement('div');
  actions.className = 'analyze-result__actions';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = '提交';
  submitBtn.addEventListener('click', () => submitAnalysis(article, result, container));

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--secondary';
  retryBtn.textContent = '重試';
  retryBtn.addEventListener('click', () => {
    window.location.hash = `#/analyze/${article.article_id}`;
  });

  actions.appendChild(submitBtn);
  actions.appendChild(retryBtn);
  container.appendChild(actions);
}

// ── Knowledge type labels ──

const KNOWLEDGE_TYPE_LABELS = {
  politician: '政治人物',
  media: '媒體',
  topic: '議題',
  term: '名詞',
  event: '事件'
};

function getKnowledgeTypeLabel(type) {
  return KNOWLEDGE_TYPE_LABELS[type] || type;
}

// ── Transparency panel ──

const ARTICLE_MAX_CHARS = 8400;

/**
 * Build a production-safe transparency panel showing the L1/L2/L3 analysis structure.
 * Does NOT expose raw prompt content; shows structured descriptions instead.
 */
function renderTransparencyPanel(result) {
  const details = document.createElement('details');
  details.className = 'transparency-panel';

  const summary = document.createElement('summary');
  summary.className = 'transparency-panel__summary';
  summary.textContent = '查看分析依據';
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'transparency-panel__content';

  // Layer 1: System Analysis Framework
  content.appendChild(renderLayerSection(
    'L1',
    '系統分析框架',
    'AI 依照預設的台灣政治光譜定義 (0=泛綠 ~ 100=泛藍) 與爭議度量表進行量化評分，再以論述分析框架產生重點摘要。'
  ));

  // Layer 2: Knowledge Injection
  const l2Section = renderLayerSection(
    'L2',
    '背景知識注入',
    null
  );
  const knowledgeEntries = result.knowledgeEntries || [];
  if (knowledgeEntries.length > 0) {
    const l2Desc = document.createElement('p');
    l2Desc.className = 'transparency-panel__layer-desc';
    l2Desc.textContent = '以下知識條目在分析時被注入給 AI 作為參考依據，AI 自行判斷哪些與本文相關。';
    l2Section.appendChild(l2Desc);

    const knowledgeList = document.createElement('ul');
    knowledgeList.className = 'transparency-panel__knowledge-list';
    for (const entry of knowledgeEntries) {
      const li = document.createElement('li');
      li.className = 'transparency-panel__knowledge-item';

      const badge = document.createElement('span');
      badge.className = `knowledge-badge knowledge-badge--${entry.type}`;
      badge.textContent = getKnowledgeTypeLabel(entry.type);
      li.appendChild(badge);

      const title = document.createElement('strong');
      title.textContent = entry.title || '';
      li.appendChild(title);

      const score = document.createElement('span');
      score.className = 'transparency-panel__score';
      score.textContent = `${Math.round((entry.score || 0) * 100)}%`;
      li.appendChild(score);

      if (entry.snippet) {
        const snippet = document.createElement('p');
        snippet.className = 'transparency-panel__snippet';
        snippet.textContent = entry.snippet;
        li.appendChild(snippet);
      }

      knowledgeList.appendChild(li);
    }
    l2Section.appendChild(knowledgeList);
  } else {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'transparency-panel__layer-desc';
    emptyMsg.textContent = '本次分析未使用額外背景知識。';
    l2Section.appendChild(emptyMsg);
  }
  content.appendChild(l2Section);

  // Layer 3: Original Article
  content.appendChild(renderLayerSection(
    'L3',
    '原始文章',
    `新聞原文 (標題 + 摘要 + 內文) 作為分析輸入，截取前 ${ARTICLE_MAX_CHARS.toLocaleString()} 字。`
  ));

  details.appendChild(content);
  return details;
}

/**
 * Create a single layer section (L1/L2/L3) for the transparency panel.
 */
function renderLayerSection(layerTag, title, description) {
  const section = document.createElement('div');
  section.className = 'transparency-panel__layer';

  const header = document.createElement('div');
  header.className = 'transparency-panel__layer-header';

  const tag = document.createElement('span');
  tag.className = 'transparency-panel__layer-tag';
  tag.textContent = layerTag;
  header.appendChild(tag);

  const titleEl = document.createElement('h4');
  titleEl.className = 'transparency-panel__layer-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  section.appendChild(header);

  if (description) {
    const desc = document.createElement('p');
    desc.className = 'transparency-panel__layer-desc';
    desc.textContent = description;
    section.appendChild(desc);
  }

  return section;
}

// ── Knowledge-to-conclusion matching ──

/**
 * Find knowledge entries whose title or snippet overlaps with a narrative point.
 * Uses simple keyword overlap (CJK-aware bigram intersection).
 */
function findMatchingKnowledge(pointText, knowledgeEntries) {
  if (!pointText || !knowledgeEntries.length) return [];

  const pointBigrams = extractBigrams(pointText);
  if (pointBigrams.size === 0) return [];

  const matched = [];
  for (const entry of knowledgeEntries) {
    const entryText = (entry.title || '') + (entry.snippet || '');
    const entryBigrams = extractBigrams(entryText);
    if (entryBigrams.size === 0) continue;

    const intersection = new Set([...pointBigrams].filter(b => entryBigrams.has(b)));
    const smaller = Math.min(pointBigrams.size, entryBigrams.size);
    const overlap = smaller > 0 ? intersection.size / smaller : 0;

    if (overlap >= 0.15) {
      matched.push(entry);
    }
  }
  return matched;
}

/**
 * Extract character bigrams from text (CJK-aware).
 */
function extractBigrams(text) {
  const clean = text.replace(/\s+/g, '');
  const bigrams = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.add(clean.substring(i, i + 2));
  }
  return bigrams;
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
    camp_ratio: result.camp_ratio || null,
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
      renderSubmitSuccess(container, false, data.data?.reward, data.data?.analysis_id);
    } else {
      renderSubmitError(container, data.error?.message || '系統錯誤，請稍後再試', article, result);
    }
  } catch (err) {
    renderSubmitError(container, '網路連線中斷，請檢查網路設定', article, result);
  }
}

function renderSubmitSuccess(container, isQueued, reward, analysisId) {
  container.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'analyze-success';

  const text = document.createElement('p');
  text.textContent = isQueued ? '已保存，連線後自動提交' : '分析已成功提交';
  msg.appendChild(text);

  // Show reward feedback if points were awarded
  if (reward && reward.points_awarded_cents > 0) {
    const rewardCard = document.createElement('div');
    rewardCard.className = 'analyze-success__reward';

    const pointsAwarded = document.createElement('p');
    pointsAwarded.className = 'analyze-success__points';
    pointsAwarded.textContent = `+${(reward.points_awarded_cents / 100).toFixed(2)} 點`;
    rewardCard.appendChild(pointsAwarded);

    const totalPoints = document.createElement('p');
    totalPoints.className = 'analyze-success__total';
    totalPoints.textContent = `總點數: ${reward.display_points || '0.00'}`;
    rewardCard.appendChild(totalPoints);

    if (reward.vote_rights > 0) {
      const votes = document.createElement('p');
      votes.className = 'analyze-success__votes';
      votes.textContent = `投票權: ${reward.vote_rights} 票`;
      rewardCard.appendChild(votes);
    }

    msg.appendChild(rewardCard);
  }

  // Analysis feedback (like/dislike + report) — only if we have an analysisId
  if (analysisId && !isQueued) {
    const feedbackSection = document.createElement('div');
    feedbackSection.className = 'analysis-feedback';
    renderAnalysisFeedback(feedbackSection, analysisId);
    msg.appendChild(feedbackSection);
  }

  const actions = document.createElement('div');
  actions.className = 'analyze-success__actions';

  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn--primary';
  homeBtn.textContent = '首頁';
  homeBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  actions.appendChild(homeBtn);

  const profileBtn = document.createElement('button');
  profileBtn.className = 'btn btn--secondary';
  profileBtn.textContent = '個人資料';
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
  retryBtn.textContent = '重試';
  retryBtn.addEventListener('click', () => submitAnalysis(article, result, container));
  msg.appendChild(retryBtn);

  container.appendChild(msg);
}

// ── Analysis Feedback ──

const REPORT_REASONS = ['analysis_inaccurate', 'analysis_abnormal', 'cannot_analyze', 'data_abnormal', 'other'];

/**
 * Render like/dislike + report for a submitted analysis.
 */
async function renderAnalysisFeedback(container, analysisId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'feedback-bar';

  // Like button
  const likeBtn = document.createElement('button');
  likeBtn.className = 'feedback-btn feedback-btn--like';
  likeBtn.setAttribute('aria-label', t('feedback.like'));
  const likeIcon = document.createElement('span');
  likeIcon.className = 'feedback-btn__icon';
  likeIcon.textContent = '\u25B2';
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
  dislikeIcon.textContent = '\u25BC';
  const dislikeCount = document.createElement('span');
  dislikeCount.className = 'feedback-btn__count';
  dislikeCount.textContent = '0';
  dislikeBtn.appendChild(dislikeIcon);
  dislikeBtn.appendChild(dislikeCount);

  // Report button
  const reportBtn = document.createElement('button');
  reportBtn.className = 'feedback-btn feedback-btn--report';
  reportBtn.textContent = t('report.button');

  wrapper.appendChild(likeBtn);
  wrapper.appendChild(dislikeBtn);
  wrapper.appendChild(reportBtn);
  container.appendChild(wrapper);

  // Message area
  const msgEl = document.createElement('p');
  msgEl.className = 'feedback-bar__message';
  msgEl.hidden = true;
  container.appendChild(msgEl);

  // Fetch stats
  const stats = await fetchAnalysisFeedbackStats(analysisId);
  if (stats.success && stats.data) {
    likeCount.textContent = String(stats.data.likes || 0);
    dislikeCount.textContent = String(stats.data.dislikes || 0);

    if (stats.data.user_feedback) {
      // Already submitted — lock both buttons
      likeBtn.disabled = true;
      dislikeBtn.disabled = true;
      if (stats.data.user_feedback === 'like') likeBtn.classList.add('feedback-btn--active');
      else dislikeBtn.classList.add('feedback-btn--active');
    }
  }

  // Click handlers
  async function handleClick(type) {
    if (!isAuthenticated()) {
      showMsg(msgEl, t('feedback.login_required'), 'warning');
      return;
    }

    // Disable both buttons immediately
    likeBtn.disabled = true;
    dislikeBtn.disabled = true;

    const result = await submitAnalysisFeedback(analysisId, type, getAuthToken());
    if (result.success) {
      showMsg(msgEl, t('feedback.submit_success'), 'success');
      const updated = await fetchAnalysisFeedbackStats(analysisId);
      if (updated.success && updated.data) {
        likeCount.textContent = String(updated.data.likes || 0);
        dislikeCount.textContent = String(updated.data.dislikes || 0);
        if (updated.data.user_feedback === 'like') likeBtn.classList.add('feedback-btn--active');
        else if (updated.data.user_feedback === 'dislike') dislikeBtn.classList.add('feedback-btn--active');
      }
      // Buttons remain disabled — one-time only
    } else if (result.error?.type === 'already_submitted') {
      showMsg(msgEl, t('feedback.already_submitted'), 'warning');
      // Buttons remain disabled
    } else {
      // Re-enable on error so user can retry
      likeBtn.disabled = false;
      dislikeBtn.disabled = false;
      showMsg(msgEl, result.error?.message || t('feedback.submit_error'), 'error');
    }
  }

  likeBtn.addEventListener('click', () => handleClick('like'));
  dislikeBtn.addEventListener('click', () => handleClick('dislike'));
  reportBtn.addEventListener('click', () => showAnalysisReportDialog(analysisId, msgEl));
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `feedback-bar__message feedback-bar__message--${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function showAnalysisReportDialog(analysisId, msgEl) {
  if (!isAuthenticated()) {
    showMsg(msgEl, t('report.login_required'), 'warning');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'report-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const dialog = document.createElement('div');
  dialog.className = 'report-dialog';

  const heading = document.createElement('h3');
  heading.textContent = t('report.title');
  dialog.appendChild(heading);

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

  const descInput = document.createElement('textarea');
  descInput.className = 'report-dialog__desc';
  descInput.placeholder = t('report.description_placeholder');
  descInput.rows = 3;
  descInput.maxLength = 500;
  dialog.appendChild(descInput);

  const actions = document.createElement('div');
  actions.className = 'report-dialog__actions';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = t('report.submit');
  submitBtn.addEventListener('click', async () => {
    const selected = reasonGroup.querySelector('input:checked');
    if (!selected) return;
    submitBtn.disabled = true;
    const result = await reportAnalysis(analysisId, selected.value, descInput.value.trim() || undefined, getAuthToken());
    overlay.remove();
    if (result.success) {
      showMsg(msgEl, t('report.success'), 'success');
    } else if (result.error?.type === 'duplicate_report') {
      showMsg(msgEl, t('report.duplicate'), 'warning');
    } else {
      showMsg(msgEl, result.error?.message || t('report.error'), 'error');
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
}
