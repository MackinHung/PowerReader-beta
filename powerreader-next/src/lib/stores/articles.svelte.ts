/**
 * PowerReader - Articles Store (Svelte 5 Runes)
 *
 * Reactive store wrapping API + IDB cache for articles.
 * Provides paginated fetching, search, and offline-first access.
 */

import type { Article } from '$lib/types/models.js';
import type { PageOneCache } from '$lib/types/stores.js';

import * as api from '$lib/core/api.js';

let articles: Article[] = $state([]);
let loading: boolean = $state(false);
let error: string | null = $state(null);
let hasMore: boolean = $state(true);
let currentPage: number = $state(1);
let currentFilter: string = $state('all');
let currentSort: string = $state('published_at');
let searchQuery: string = $state('');

// In-memory page-1 cache per category — instant re-tap
const _pageOneCache: Record<string, PageOneCache> = {};

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
     */
    async fetchArticles(filter: string = 'all', page: number = 1): Promise<void> {
      // Instant return from memory cache for page 1 re-tap
      if (page === 1 && _pageOneCache[filter]) {
        articles = _pageOneCache[filter].articles;
        hasMore = _pageOneCache[filter].hasMore;
        currentPage = 1;
        currentFilter = filter;
        return;
      }

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

        const incoming: Article[] = result.data?.articles || [];

        if (page === 1) {
          articles = incoming;
          // Cache page 1 results in memory
          _pageOneCache[filter] = { articles: incoming, hasMore: incoming.length >= 20 };
        } else {
          const existingIds = new Set(articles.map(a => a.article_id));
          const unique = incoming.filter(a => !existingIds.has(a.article_id));
          articles = [...articles, ...unique];
        }

        hasMore = incoming.length >= 20;
        currentPage = page;
        currentFilter = filter;
      } catch (e) {
        error = (e as Error).message;
      } finally {
        loading = false;
      }
    },

    /** Load next page using current filter. */
    async loadMore(): Promise<void> {
      if (!loading && hasMore) {
        await this.fetchArticles(currentFilter, currentPage + 1);
      }
    },

    /**
     * Search articles by keyword.
     */
    async searchArticles(query: string): Promise<void> {
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
        const searchData = result.data as { articles?: Article[]; items?: Article[] } | null;
        articles = searchData?.articles || searchData?.items || [];
        hasMore = false;
        currentPage = 1;
      } catch (e) {
        error = (e as Error).message;
      } finally {
        loading = false;
      }
    },

    /**
     * Find a single article from the loaded list.
     */
    getArticle(id: string): Article | undefined {
      return articles.find(a => a.article_id === id || a.article_hash === id);
    },

    /** Refresh from page 1 with current filter. */
    async refreshArticles(): Promise<void> {
      delete _pageOneCache[currentFilter];
      await this.fetchArticles(currentFilter, 1);
    },

    /**
     * Change sort order and re-fetch.
     */
    async setSortBy(sortBy: string): Promise<void> {
      currentSort = sortBy;
      // Invalidate all caches — sort order affects all categories
      for (const key of Object.keys(_pageOneCache)) delete _pageOneCache[key];
      await this.fetchArticles(currentFilter, 1);
    },

    /** Clear search and reset to default listing. */
    async clearSearch(): Promise<void> {
      searchQuery = '';
      await this.fetchArticles(currentFilter, 1);
    }
  };
}
