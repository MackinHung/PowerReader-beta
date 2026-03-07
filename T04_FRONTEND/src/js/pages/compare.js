/**
 * PowerReader - Compare Page
 *
 * Cross-media comparison: side-by-side bias scores from different
 * media sources reporting on the same event.
 *
 * Routes: #/compare
 *
 * Uses the articles API with sort_by=controversy_score to get
 * high-controversy articles, then loads their clusters for comparison.
 */

import { t } from '../../locale/zh-TW.js';
import { fetchArticles, fetchArticleCluster } from '../api.js';
import { createBiasBar } from '../components/bias-bar.js';
import { getUserErrorMessage } from '../utils/error.js';

/**
 * Render compare page.
 * @param {HTMLElement} container
 */
export async function renderCompare(container) {
  container.innerHTML = '';

  // Title
  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = t('nav.title.compare');
  container.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'compare-page__desc';
  desc.textContent = t('compare.desc');
  container.appendChild(desc);

  // Loading
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.setAttribute('role', 'status');
  loadingEl.textContent = t('common.label.loading');
  container.appendChild(loadingEl);

  // Fetch high-controversy articles (likely to have multiple media covering same event)
  const result = await fetchArticles({
    page: 1,
    limit: 10,
    sort_by: 'controversy_score',
    sort_order: 'desc'
  });

  loadingEl.remove();

  if (!result.success) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-state';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = getUserErrorMessage(result.error);
    container.appendChild(errorEl);
    return;
  }

  if (!result.data?.articles?.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('common.label.no_data');
    container.appendChild(empty);
    return;
  }

  // Render comparison cards
  const list = document.createElement('div');
  list.className = 'compare-list';
  container.appendChild(list);

  // Load clusters for each article in parallel
  const clusterPromises = result.data.articles.map(article =>
    loadComparisonCard(list, article)
  );
  await Promise.all(clusterPromises);
}

/**
 * Load and render a comparison card for one event cluster.
 */
async function loadComparisonCard(list, article) {
  const clusterResult = await fetchArticleCluster(article.article_id);

  // Only show articles that have multiple sources
  const clusterArticles = clusterResult.success && clusterResult.data?.articles
    ? clusterResult.data.articles
    : [article];

  if (clusterArticles.length < 2) return; // Skip single-source events

  const card = document.createElement('section');
  card.className = 'compare-card';

  // Event title
  const heading = document.createElement('h3');
  heading.className = 'compare-card__title';
  heading.textContent = article.title || '';
  heading.style.cursor = 'pointer';
  heading.setAttribute('tabindex', '0');
  heading.setAttribute('role', 'link');
  const navigateToArticle = () => {
    window.location.hash = `#/article/${article.article_id}`;
  };
  heading.addEventListener('click', navigateToArticle);
  heading.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToArticle();
    }
  });
  card.appendChild(heading);

  // Source count
  const meta = document.createElement('p');
  meta.className = 'compare-card__meta';
  meta.textContent = t('common.label.source_count', { count: clusterArticles.length });
  card.appendChild(meta);

  // Source comparison table
  const table = document.createElement('div');
  table.className = 'compare-card__sources';
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', t('compare.table_label'));

  for (const clusterArticle of clusterArticles) {
    const row = document.createElement('div');
    row.className = 'compare-card__row';
    row.setAttribute('role', 'row');

    // Source name
    const sourceName = document.createElement('span');
    sourceName.className = 'compare-card__source';
    sourceName.setAttribute('role', 'cell');
    const sourceLabel = t(`source.name.${clusterArticle.source}`);
    sourceName.textContent = sourceLabel.startsWith('source.name.') ? clusterArticle.source : sourceLabel;

    // Bias bar (mini)
    const biasCell = document.createElement('div');
    biasCell.className = 'compare-card__bias';
    biasCell.setAttribute('role', 'cell');
    if (clusterArticle.bias_score != null) {
      biasCell.appendChild(createBiasBar(clusterArticle.bias_score, clusterArticle.bias_category || 'center'));
    }

    // Score label
    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'compare-card__score';
    scoreLabel.setAttribute('role', 'cell');
    scoreLabel.textContent = clusterArticle.bias_score != null
      ? String(clusterArticle.bias_score)
      : '-';

    // Category
    const catLabel = document.createElement('span');
    catLabel.className = `bias-indicator bias-indicator--${clusterArticle.bias_category || 'center'}`;
    catLabel.setAttribute('role', 'cell');
    catLabel.textContent = clusterArticle.bias_category
      ? t(`bias.label.${clusterArticle.bias_category}`)
      : '-';

    row.appendChild(sourceName);
    row.appendChild(biasCell);
    row.appendChild(scoreLabel);
    row.appendChild(catLabel);
    table.appendChild(row);
  }

  card.appendChild(table);

  // Score spread indicator
  const scores = clusterArticles
    .filter(a => a.bias_score != null)
    .map(a => a.bias_score);
  if (scores.length >= 2) {
    const spread = Math.max(...scores) - Math.min(...scores);
    const spreadEl = document.createElement('p');
    spreadEl.className = 'compare-card__spread';
    spreadEl.textContent = t('compare.spread', { spread: String(spread) });
    card.appendChild(spreadEl);
  }

  list.appendChild(card);
}
