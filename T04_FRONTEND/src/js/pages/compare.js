/**
 * PowerReader - Compare Page
 *
 * Cross-media comparison: side-by-side bias scores from different
 * media sources reporting on the same event.
 *
 * Routes: #/compare
 *
 * Uses title bigram Jaccard similarity (via cluster API) to find
 * articles about the same event from different media sources.
 */

import { t } from '../../locale/zh-TW.js';
import { fetchArticles, fetchArticleCluster } from '../api.js';
import { createCampBar } from '../components/camp-bar.js';
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

  // Fetch recent articles (published_at DESC) — more candidates = more cross-media hits
  const result = await fetchArticles({
    page: 1,
    limit: 20,
    sort_by: 'published_at',
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

  // Load all clusters in parallel
  const clusterResults = await Promise.all(
    result.data.articles.map(article =>
      fetchArticleCluster(article.article_id)
        .then(cr => ({ article, cluster: cr }))
    )
  );

  // Deduplicate: skip articles already shown in a previous cluster
  const seenIds = new Set();

  for (const { article, cluster } of clusterResults) {
    if (seenIds.has(article.article_id)) continue;

    const clusterArticles = cluster.success && cluster.data?.articles
      ? cluster.data.articles
      : [];

    // Only show events with multiple sources
    if (clusterArticles.length < 1) continue;

    // Mark all articles in this cluster as seen to avoid duplicate cards
    seenIds.add(article.article_id);
    for (const ca of clusterArticles) {
      seenIds.add(ca.article_id);
    }

    renderComparisonCard(list, article, clusterArticles);
  }

  // Show empty state if no multi-source events found
  if (list.children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('common.label.no_data');
    list.appendChild(empty);
  }
}

/**
 * Render a comparison card for one event cluster.
 * @param {HTMLElement} list
 * @param {Object} article - Source article
 * @param {Object[]} clusterArticles - Similar articles from other sources
 */
function renderComparisonCard(list, article, clusterArticles) {
  // Combine source article + cluster for the full comparison set
  const allArticles = [article, ...clusterArticles];

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
  meta.textContent = t('common.label.source_count', { count: allArticles.length });
  card.appendChild(meta);

  // Source comparison table
  const table = document.createElement('div');
  table.className = 'compare-card__sources';
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', t('compare.table_label'));

  for (const clusterArticle of allArticles) {
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
    if (clusterArticle.camp_ratio) {
      const campData = typeof clusterArticle.camp_ratio === 'string'
        ? JSON.parse(clusterArticle.camp_ratio)
        : clusterArticle.camp_ratio;
      biasCell.appendChild(createCampBar(campData));
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
  const scores = allArticles
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
