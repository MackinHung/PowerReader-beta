/**
 * PowerReader - Articles Store (Svelte 5 Runes)
 *
 * Reactive store wrapping API + IDB cache for articles.
 * Provides paginated fetching, search, and offline-first access.
 */

import * as api from '$lib/core/api.js';

let articles = $state([]);
let loading = $state(false);
let error = $state(null);
let hasMore = $state(true);
let currentPage = $state(1);
let currentFilter = $state('all');
let currentSort = $state('published_at');
let searchQuery = $state('');

export function getArticlesStore() {
  return {
    get articles() { return articles; },
    get loading() { return loading; },
    get error() { return error; },
    get hasMore() { return hasMore; },
    get currentFilter() { return currentFilter; },
    get currentSort() { return currentSort; },
    get searchQuery() { return searchQuery; },

    /**
     * Fetch articles with optional filter and pagination.
     * @param {string} filter - 'all' or source name
     * @param {number} page - Page number (1-based)
     */
    async fetchArticles(filter = 'all', page = 1) {
      loading = true;
      error = null;
      try {
        const result = await api.fetchArticles({
          category: filter === 'all' ? undefined : filter,
          sort_by: currentSort,
          page,
          limit: 20
        });

        if (!result.success) {
          error = result.error?.type || 'fetch_failed';
          return;
        }

        const incoming = result.data?.articles || [];

        if (page === 1) {
          articles = incoming;
        } else {
          articles = [...articles, ...incoming];
        }

        hasMore = incoming.length >= 20;
        currentPage = page;
        currentFilter = filter;
      } catch (e) {
        error = e.message;
      } finally {
        loading = false;
      }
    },

    /** Load next page using current filter. */
    async loadMore() {
      if (!loading && hasMore) {
        await this.fetchArticles(currentFilter, currentPage + 1);
      }
    },

    /**
     * Search articles by keyword.
     * @param {string} query
     */
    async searchArticles(query) {
      searchQuery = query;
      if (!query.trim()) {
        await this.fetchArticles(currentFilter, 1);
        return;
      }

      loading = true;
      error = null;
      try {
        const result = await api.searchArticles(query);
        if (!result.success) {
          error = result.error?.type || 'search_failed';
          return;
        }
        articles = result.data?.articles || result.data?.items || [];
        hasMore = false;
        currentPage = 1;
      } catch (e) {
        error = e.message;
      } finally {
        loading = false;
      }
    },

    /**
     * Find a single article from the loaded list.
     * @param {string} id - article_id or article_hash
     * @returns {Object|undefined}
     */
    getArticle(id) {
      return articles.find(a => a.article_id === id || a.article_hash === id);
    },

    /** Refresh from page 1 with current filter. */
    async refreshArticles() {
      await this.fetchArticles(currentFilter, 1);
    },

    /**
     * Change sort order and re-fetch.
     * @param {string} sortBy - 'published_at' or other valid sort field
     */
    async setSortBy(sortBy) {
      currentSort = sortBy;
      await this.fetchArticles(currentFilter, 1);
    },

    /** Clear search and reset to default listing. */
    async clearSearch() {
      searchQuery = '';
      await this.fetchArticles(currentFilter, 1);
    }
  };
}
