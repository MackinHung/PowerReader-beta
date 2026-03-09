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
import { createCampBar } from '../components/camp-bar.js';
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

  // Camp ratio bar (three-camp stacked bar)
  if (result.camp_ratio) {
    container.appendChild(createCampBar(result.camp_ratio));
  }

  // Narrative Points (Pass 2 output) with knowledge linking
  if (result.points && result.points.length > 0) {
    const knowledgeEntries = result.knowledgeEntries || [];
    const highRelevanceEntries = knowledgeEntries.filter(e => (e.score || 0) >= 0.7);

    const pointsSection = document.createElement('div');
    pointsSection.className = 'analyze-result__narrative';

    const pointsHeading = document.createElement('h4');
    pointsHeading.textContent = t('analyze.narrative_points');
    pointsSection.appendChild(pointsHeading);

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

  // Transparency panel: structured L1/L2/L3 analysis basis
  container.appendChild(renderTransparencyPanel(result));

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
  summary.textContent = t('analyze.transparency.toggle');
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'transparency-panel__content';

  // Layer 1: System Analysis Framework
  content.appendChild(renderLayerSection(
    'L1',
    t('analyze.transparency.l1_title'),
    t('analyze.transparency.l1_desc')
  ));

  // Layer 2: Knowledge Injection
  const l2Section = renderLayerSection(
    'L2',
    t('analyze.transparency.l2_title'),
    null
  );
  const knowledgeEntries = result.knowledgeEntries || [];
  if (knowledgeEntries.length > 0) {
    const l2Desc = document.createElement('p');
    l2Desc.className = 'transparency-panel__layer-desc';
    l2Desc.textContent = t('analyze.transparency.l2_desc');
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
    emptyMsg.textContent = t('analyze.transparency.l2_empty');
    l2Section.appendChild(emptyMsg);
  }
  content.appendChild(l2Section);

  // Layer 3: Original Article
  content.appendChild(renderLayerSection(
    'L3',
    t('analyze.transparency.l3_title'),
    t('analyze.transparency.l3_desc', { chars: ARTICLE_MAX_CHARS.toLocaleString() })
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
