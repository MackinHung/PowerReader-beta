/**
 * PowerReader - Home Page
 *
 * Latest articles sorted by published date, with infinite scroll.
 * Offline: loads cached articles from IndexedDB.
 *
 * Features:
 *   - Paginated article list (20/page)
 *   - IntersectionObserver infinite scroll
 *   - Category filter dropdown
 *   - Loading / error / empty states
 */

import { t } from '../../locale/zh-TW.js';
import { fetchArticles, searchArticles } from '../api.js';
import { createArticleCard } from '../components/article-card.js';
import { getUserErrorMessage } from '../utils/error.js';

// Pagination state (per render lifecycle)
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentCategory = '';
let currentSearchQuery = '';
let observer = null;

/**
 * Render the Home page.
 * @param {HTMLElement} container - Main content container
 */
export function renderHome(container) {
  // Reset state
  currentPage = 1;
  isLoading = false;
  hasMore = true;
  currentCategory = '';
  currentSearchQuery = '';
  if (observer) { observer.disconnect(); observer = null; }

  container.innerHTML = '';

  // Page header
  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = t('nav.title.home');
  container.appendChild(heading);

  // Search bar
  container.appendChild(createSearchBar());

  // Category filter
  container.appendChild(createCategoryFilter());

  // Article list container
  const list = document.createElement('div');
  list.className = 'article-list';
  list.setAttribute('role', 'feed');
  list.setAttribute('aria-label', t('nav.title.home'));
  container.appendChild(list);

  // Scroll sentinel
  const sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';
  container.appendChild(sentinel);

  // Loading indicator
  const loader = document.createElement('div');
  loader.className = 'loading-indicator';
  loader.hidden = true;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.textContent = t('common.label.loading');
  container.appendChild(loader);

  // Load first page
  loadArticles(list, loader);

  // Infinite scroll
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && hasMore) {
      currentPage += 1;
      loadArticles(list, loader);
    }
  }, { threshold: 0.1, rootMargin: '200px' });

  observer.observe(sentinel);
}

/**
 * Create search bar with input and button.
 * @returns {HTMLElement}
 */
function createSearchBar() {
  const wrapper = document.createElement('div');
  wrapper.className = 'home-search';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'home-search__input';
  input.placeholder = t('search.placeholder');
  input.setAttribute('aria-label', t('a11y.search.input'));

  const searchBtn = document.createElement('button');
  searchBtn.className = 'btn btn--primary home-search__btn';
  searchBtn.textContent = t('search.button');

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn--text home-search__clear';
  clearBtn.textContent = t('search.clear');
  clearBtn.hidden = true;

  function doSearch() {
    const query = input.value.trim();
    if (query.length < 2) return;

    currentSearchQuery = query;
    currentPage = 1;
    hasMore = true;
    clearBtn.hidden = false;

    const list = document.querySelector('.article-list');
    const loader = document.querySelector('.loading-indicator');
    if (list) {
      list.innerHTML = '';
      loadArticles(list, loader);
    }
  }

  function clearSearch() {
    input.value = '';
    currentSearchQuery = '';
    currentPage = 1;
    hasMore = true;
    clearBtn.hidden = true;

    const list = document.querySelector('.article-list');
    const loader = document.querySelector('.loading-indicator');
    if (list) {
      list.innerHTML = '';
      loadArticles(list, loader);
    }
  }

  searchBtn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
  clearBtn.addEventListener('click', clearSearch);

  wrapper.appendChild(input);
  wrapper.appendChild(searchBtn);
  wrapper.appendChild(clearBtn);

  return wrapper;
}

/**
 * Create category filter dropdown.
 * @returns {HTMLElement}
 */
function createCategoryFilter() {
  const wrapper = document.createElement('div');
  wrapper.className = 'home-filters';

  const label = document.createElement('label');
  label.setAttribute('for', 'category-filter');
  label.textContent = t('a11y.filter.category');
  label.className = 'visually-hidden';

  const select = document.createElement('select');
  select.id = 'category-filter';
  select.className = 'home-filters__select';

  // "All" option
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = t('nav.title.home');
  select.appendChild(allOption);

  // Category options
  const categories = [
    'politics', 'economy', 'society', 'technology', 'international',
    'entertainment', 'sports', 'health', 'education', 'environment'
  ];
  for (const cat of categories) {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = t(`category.label.${cat}`);
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    currentCategory = select.value;
    currentPage = 1;
    hasMore = true;

    const list = document.querySelector('.article-list');
    const loader = document.querySelector('.loading-indicator');
    if (list) {
      list.innerHTML = '';
      loadArticles(list, loader);
    }
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);

  return wrapper;
}

/**
 * Fetch and append articles to the list.
 * @param {HTMLElement} list - Article list container
 * @param {HTMLElement} loader - Loading indicator
 */
async function loadArticles(list, loader) {
  if (isLoading || !hasMore) return;
  isLoading = true;
  if (loader) loader.hidden = false;

  let result;

  if (currentSearchQuery) {
    // Search mode
    result = await searchArticles(currentSearchQuery, {
      page: currentPage,
      limit: 20
    });
  } else {
    // Normal browse mode
    result = await fetchArticles({
      page: currentPage,
      limit: 20,
      sort_by: 'published_at',
      sort_order: 'desc',
      category: currentCategory || undefined
    });
  }

  if (loader) loader.hidden = true;
  isLoading = false;

  if (!result.success) {
    if (currentPage === 1) {
      renderError(list, getUserErrorMessage(result.error));
    }
    return;
  }

  // Search API returns items, articles API returns articles
  const articles = result.data?.items || result.data?.articles || [];
  const pagination = result.data?.pagination;

  if (articles.length === 0 && currentPage === 1) {
    if (currentSearchQuery) {
      renderEmpty(list, t('search.no_results'));
    } else {
      renderEmpty(list);
    }
    hasMore = false;
    return;
  }

  // Show result count for search
  if (currentSearchQuery && currentPage === 1 && pagination) {
    const countEl = document.createElement('p');
    countEl.className = 'home-search__results-count';
    countEl.textContent = t('search.results_count', { count: pagination.total });
    list.appendChild(countEl);
  }

  for (const article of articles) {
    list.appendChild(createArticleCard(article));
  }

  // Check if more pages
  if (pagination && currentPage >= pagination.total_pages) {
    hasMore = false;
  }
}

/**
 * Render empty state.
 * @param {HTMLElement} container
 */
function renderEmpty(container, message) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.setAttribute('role', 'status');

  const icon = document.createElement('div');
  icon.className = 'empty-state__icon';
  icon.textContent = '---';

  const text = document.createElement('p');
  text.textContent = message || t('common.label.no_data');

  el.appendChild(icon);
  el.appendChild(text);
  container.appendChild(el);
}

/**
 * Render error state.
 * @param {HTMLElement} container
 * @param {string} message
 */
function renderError(container, message) {
  const el = document.createElement('div');
  el.className = 'error-state';
  el.setAttribute('role', 'alert');

  const text = document.createElement('p');
  text.textContent = message;

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--primary';
  retryBtn.textContent = t('common.button.retry');
  retryBtn.addEventListener('click', () => {
    container.innerHTML = '';
    const loader = document.querySelector('.loading-indicator');
    currentPage = 1;
    hasMore = true;
    loadArticles(container, loader);
  });

  el.appendChild(text);
  el.appendChild(retryBtn);
  container.appendChild(el);
}
