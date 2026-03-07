/**
 * PowerReader - Article Detail Page
 *
 * Full article view with bias visualization, controversy meter,
 * knowledge panel (RAG transparency), and cross-media cluster.
 *
 * Routes: #/article/{article_id}
 */

import { t } from '../../locale/zh-TW.js';
import { fetchArticle, fetchArticleCluster, fetchArticleKnowledge } from '../api.js';
import { createBiasBar } from '../components/bias-bar.js';
import { createControversyMeter } from '../components/controversy-badge.js';

/**
 * Format date for Taiwan locale display.
 */
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

/**
 * Get news source display name.
 */
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
  container.innerHTML = '';

  // Loading state
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.setAttribute('role', 'status');
  loadingEl.textContent = t('common.label.loading');
  container.appendChild(loadingEl);

  // Fetch article
  const result = await fetchArticle(articleId);

  container.innerHTML = '';

  if (!result.success) {
    renderDetailError(container, result.error?.message || t('error.message.generic'));
    return;
  }

  const article = result.data;
  renderArticleContent(container, article);

  // Load supplementary data in parallel (non-blocking)
  loadKnowledgePanel(container, articleId);
  loadClusterPanel(container, articleId);
}

/**
 * Render article content.
 */
function renderArticleContent(container, article) {
  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--text article-detail__back';
  backBtn.textContent = t('nav.button.back');
  backBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  container.appendChild(backBtn);

  // Source and date header
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

  // Title
  const title = document.createElement('h2');
  title.className = 'article-detail__title';
  title.textContent = article.title || '';
  container.appendChild(title);

  // Bias visualization (large)
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

  // Controversy meter
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

  // Summary
  if (article.summary) {
    const summarySection = document.createElement('section');
    summarySection.className = 'article-detail__summary';

    const summaryText = document.createElement('p');
    summaryText.textContent = article.summary;
    summarySection.appendChild(summaryText);
    container.appendChild(summarySection);
  }

  // Original link
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

  // Analyze button
  const analyzeBtn = document.createElement('button');
  analyzeBtn.className = 'btn btn--secondary';
  analyzeBtn.textContent = t('common.button.start_analysis');
  analyzeBtn.setAttribute('aria-label', t('a11y.button.analyze'));
  analyzeBtn.addEventListener('click', () => {
    window.location.hash = `#/analyze/${article.article_id}`;
  });
  container.appendChild(analyzeBtn);

  // Knowledge panel placeholder
  const knowledgeSlot = document.createElement('section');
  knowledgeSlot.id = 'knowledge-panel';
  knowledgeSlot.className = 'article-detail__knowledge';
  knowledgeSlot.setAttribute('aria-label', 'Knowledge Panel');
  container.appendChild(knowledgeSlot);

  // Cluster panel placeholder
  const clusterSlot = document.createElement('section');
  clusterSlot.id = 'cluster-panel';
  clusterSlot.className = 'article-detail__cluster';
  clusterSlot.setAttribute('aria-label', 'Cross-Media Comparison');
  container.appendChild(clusterSlot);
}

/**
 * Load and render knowledge entries panel.
 */
async function loadKnowledgePanel(container, articleId) {
  const slot = container.querySelector('#knowledge-panel');
  if (!slot) return;

  const result = await fetchArticleKnowledge(articleId);
  if (!result.success || !result.data?.knowledge_entries?.length) return;

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('article.knowledge.title');

  const details = document.createElement('details');
  details.className = 'knowledge-panel';

  const summary = document.createElement('summary');
  summary.className = 'knowledge-panel__summary';
  summary.textContent = t('article.knowledge.summary', { count: result.data.knowledge_entries.length });
  details.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'knowledge-panel__list';

  for (const entry of result.data.knowledge_entries) {
    const item = document.createElement('li');
    item.className = 'knowledge-panel__item';

    const typeBadge = document.createElement('span');
    typeBadge.className = `knowledge-badge knowledge-badge--${entry.type}`;
    typeBadge.textContent = getKnowledgeTypeLabel(entry.type);

    const titleEl = document.createElement('strong');
    titleEl.textContent = entry.title || '';

    const snippet = document.createElement('p');
    snippet.className = 'knowledge-panel__snippet';
    snippet.textContent = entry.snippet || '';

    const score = document.createElement('span');
    score.className = 'knowledge-panel__score';
    score.textContent = `${Math.round((entry.score || 0) * 100)}%`;

    item.appendChild(typeBadge);
    item.appendChild(titleEl);
    item.appendChild(snippet);
    item.appendChild(score);
    list.appendChild(item);
  }

  details.appendChild(list);
  slot.appendChild(details);
}

/**
 * Get knowledge type display label.
 */
function getKnowledgeTypeLabel(type) {
  const labels = {
    politician: '政治人物',
    media: '媒體',
    topic: '議題',
    term: '名詞',
    event: '事件'
  };
  return labels[type] || type;
}

/**
 * Load and render cross-media cluster panel.
 */
async function loadClusterPanel(container, articleId) {
  const slot = container.querySelector('#cluster-panel');
  if (!slot) return;

  const result = await fetchArticleCluster(articleId);
  if (!result.success || !result.data?.articles?.length) return;

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('nav.title.compare');
  slot.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'cluster-panel__desc';
  desc.textContent = t('common.label.source_count', { count: result.data.articles.length });
  slot.appendChild(desc);

  const list = document.createElement('div');
  list.className = 'cluster-panel__list';

  for (const clusterArticle of result.data.articles) {
    if (clusterArticle.article_id === articleId) continue; // Skip self

    const item = document.createElement('div');
    item.className = 'cluster-panel__item';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      window.location.hash = `#/article/${clusterArticle.article_id}`;
    });

    const sourceName = document.createElement('span');
    sourceName.className = 'article-card__source';
    sourceName.textContent = getSourceName(clusterArticle.source);

    const titleEl = document.createElement('span');
    titleEl.className = 'cluster-panel__title';
    titleEl.textContent = clusterArticle.title || '';

    const biasLabel = document.createElement('span');
    biasLabel.className = `bias-indicator bias-indicator--${clusterArticle.bias_category || 'center'}`;
    biasLabel.textContent = clusterArticle.bias_score != null ? String(clusterArticle.bias_score) : '-';

    item.appendChild(sourceName);
    item.appendChild(titleEl);
    item.appendChild(biasLabel);
    list.appendChild(item);
  }

  slot.appendChild(list);
}

/**
 * Render error state on detail page.
 */
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
