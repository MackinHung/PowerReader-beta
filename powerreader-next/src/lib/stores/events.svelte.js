/**
 * PowerReader - Events Store (Svelte 5 Runes)
 *
 * Reactive store for event clusters.
 * Supports both legacy events (blindspot_events) and new pre-computed clusters.
 */

import * as api from '$lib/core/api.js';

// Legacy events state
let events = $state([]);
let loading = $state(false);
let error = $state(null);
let hasMore = $state(true);
let currentPage = $state(1);
let expandedArticles = $state({});
let expandingId = $state(null);

// Pre-computed clusters state
let clusters = $state([]);
let clustersLoading = $state(false);
let clustersError = $state(null);
let clustersHasMore = $state(true);
let clustersPage = $state(1);
let unclusteredArticleIds = $state([]);

export function getEventsStore() {
  return {
    // Legacy events getters
    get events() { return events; },
    get loading() { return loading; },
    get error() { return error; },
    get hasMore() { return hasMore; },
    get expandingId() { return expandingId; },

    // Pre-computed clusters getters
    get clusters() { return clusters; },
    get clustersLoading() { return clustersLoading; },
    get clustersError() { return clustersError; },
    get clustersHasMore() { return clustersHasMore; },
    get unclusteredArticleIds() { return unclusteredArticleIds; },

    // ==========================================
    // Pre-computed Clusters (new)
    // ==========================================

    /**
     * Fetch pre-computed clusters with pagination.
     * @param {number} page - Page number (1-based)
     * @param {string} [category] - Optional category filter
     */
    async fetchClusters(page = 1, category) {
      clustersLoading = true;
      clustersError = null;
      try {
        const result = await api.fetchClusters({ page, limit: 20, category });

        if (!result.success) {
          clustersError = result.error?.type || 'fetch_failed';
          return;
        }

        const incoming = result.data?.clusters || [];

        if (page === 1) {
          clusters = incoming;
          unclusteredArticleIds = result.data?.unclustered_article_ids || [];
        } else {
          clusters = [...clusters, ...incoming];
        }

        clustersHasMore = incoming.length >= 20;
        clustersPage = page;
      } catch (e) {
        clustersError = e.message;
      } finally {
        clustersLoading = false;
      }
    },

    /** Load next page of clusters. */
    async loadMoreClusters(category) {
      if (!clustersLoading && clustersHasMore) {
        await this.fetchClusters(clustersPage + 1, category);
      }
    },

    /** Refresh clusters from page 1. */
    async refreshClusters(category) {
      await this.fetchClusters(1, category);
    },

    // ==========================================
    // Legacy Events (backward compat)
    // ==========================================

    /**
     * Fetch event clusters with pagination.
     * @param {number} page - Page number (1-based)
     */
    async fetchEvents(page = 1) {
      loading = true;
      error = null;
      try {
        const result = await api.fetchEvents({ page, limit: 20 });

        if (!result.success) {
          error = result.error?.type || 'fetch_failed';
          return;
        }

        const incoming = result.data?.items || result.data?.events || [];

        if (page === 1) {
          events = incoming;
        } else {
          events = [...events, ...incoming];
        }

        hasMore = incoming.length >= 20;
        currentPage = page;
      } catch (e) {
        error = e.message;
      } finally {
        loading = false;
      }
    },

    /** Load next page of events. */
    async loadMore() {
      if (!loading && hasMore) {
        await this.fetchEvents(currentPage + 1);
      }
    },

    /**
     * Expand an event cluster by searching for its articles.
     * Uses search API as workaround (GET /events/{id} returns 500).
     * Truncates title to avoid backend 500 on long Chinese queries.
     * Only caches if results were found; empty results allow retry.
     * @param {string} clusterId
     * @param {string} title - Event title to search for
     */
    async expandEvent(clusterId, title) {
      if (expandedArticles[clusterId]?.length > 0) return;

      expandingId = clusterId;
      try {
        // Truncate title: long Chinese queries cause backend 500.
        // Try 15 chars first, fallback to 8 chars if no results.
        const shortTitle = (title || '').slice(0, 15);
        let result = await api.searchArticles(shortTitle);
        let articles = result.success
          ? (result.data?.articles || result.data?.items || [])
          : [];

        // Fallback: try shorter query if no results
        if (articles.length === 0 && shortTitle.length > 8) {
          const shorterTitle = (title || '').slice(0, 8);
          result = await api.searchArticles(shorterTitle);
          articles = result.success
            ? (result.data?.articles || result.data?.items || [])
            : [];
        }

        if (articles.length > 0) {
          expandedArticles = { ...expandedArticles, [clusterId]: articles };
        }
      } catch {
        // Don't cache empty on error — allow retry
      } finally {
        expandingId = null;
      }
    },

    /**
     * Collapse an expanded event cluster.
     * @param {string} clusterId
     */
    collapseEvent(clusterId) {
      const { [clusterId]: _, ...rest } = expandedArticles;
      expandedArticles = rest;
    },

    /**
     * Get expanded articles for a cluster.
     * @param {string} clusterId
     * @returns {Array|undefined}
     */
    getExpandedArticles(clusterId) {
      return expandedArticles[clusterId];
    },

    /** Refresh events from page 1. */
    async refreshEvents() {
      await this.fetchEvents(1);
    }
  };
}
