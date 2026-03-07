/**
 * PowerReader - Article Card Component
 *
 * Renders a clickable article card for list views.
 * Uses escapeHtml for all user-generated content.
 * Navigates to #/article/{article_id} on click.
 */

import { t } from '../../locale/zh-TW.js';
import { createBiasIndicator } from './bias-bar.js';
import { createControversyBadge } from './controversy-badge.js';

/**
 * Format date for Taiwan locale display.
 * @param {string} isoDate - ISO 8601 date string
 * @returns {string} Formatted date (e.g. "2026年3月7日")
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return '';
  }
}

/**
 * Get news source display name from source key.
 * @param {string} sourceKey - e.g. "liberty_times"
 * @returns {string} Display name (e.g. "自由時報")
 */
function getSourceName(sourceKey) {
  const label = t(`source.name.${sourceKey}`);
  // If t() returns the key itself (missing), use the raw key
  return label.startsWith('source.name.') ? sourceKey : label;
}

/**
 * Create an article card element.
 *
 * @param {Object} article - Article data from API
 * @param {string} article.article_id
 * @param {string} article.title
 * @param {string} article.source
 * @param {string} article.summary
 * @param {string} article.published_at
 * @param {number} article.bias_score
 * @param {string} article.bias_category
 * @param {number} article.controversy_score
 * @param {string} article.controversy_level
 * @returns {HTMLElement} Article card element
 */
export function createArticleCard(article) {
  const card = document.createElement('article');
  card.className = 'article-card';
  card.setAttribute('role', 'article');
  card.setAttribute('aria-label', t('a11y.article_card', {
    title: article.title,
    source: getSourceName(article.source),
    date: formatDate(article.published_at)
  }));

  // Make entire card clickable
  card.addEventListener('click', () => {
    window.location.hash = `#/article/${article.article_id}`;
  });
  card.style.cursor = 'pointer';
  card.setAttribute('tabindex', '0');
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.hash = `#/article/${article.article_id}`;
    }
  });

  // Header row: source badge + date
  const header = document.createElement('div');
  header.className = 'article-card__header';

  const sourceBadge = document.createElement('span');
  sourceBadge.className = 'article-card__source';
  sourceBadge.textContent = getSourceName(article.source);

  const dateEl = document.createElement('time');
  dateEl.className = 'article-card__date';
  dateEl.setAttribute('datetime', article.published_at || '');
  dateEl.textContent = formatDate(article.published_at);

  header.appendChild(sourceBadge);
  header.appendChild(dateEl);
  card.appendChild(header);

  // Title
  const title = document.createElement('h3');
  title.className = 'article-card__title';
  title.textContent = article.title || '';
  card.appendChild(title);

  // Summary (truncated)
  if (article.summary) {
    const summary = document.createElement('p');
    summary.className = 'article-card__summary';
    const truncated = article.summary.length > 100
      ? article.summary.slice(0, 100) + '...'
      : article.summary;
    summary.textContent = truncated;
    card.appendChild(summary);
  }

  // Footer: bias indicator + controversy badge
  const footer = document.createElement('div');
  footer.className = 'article-card__footer';

  if (article.bias_score != null && article.bias_category) {
    footer.appendChild(createBiasIndicator(article.bias_score, article.bias_category));
  }

  if (article.controversy_score != null && article.controversy_level) {
    footer.appendChild(createControversyBadge(article.controversy_score, article.controversy_level));
  }

  card.appendChild(footer);

  return card;
}
