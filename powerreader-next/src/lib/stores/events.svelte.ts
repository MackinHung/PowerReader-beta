/**
 * PowerReader - Events Store (Svelte 5 Runes)
 *
 * Reactive store for event clusters.
 * Supports both legacy events (blindspot_events) and new pre-computed clusters.
 */

import type { BlindspotEvent, EventCluster, Article } from '$lib/types/models.js';
import type { ExpandedArticles } from '$lib/types/stores.js';

import * as api from '$lib/core/api.js';

// Legacy events state
let events: BlindspotEvent[] = $state([]);
let loading: boolean = $state(false);
let error: string | null = $state(null);
let hasMore: boolean = $state(true);
let currentPage: number = $state(1);
let expandedArticles: ExpandedArticles = $state({});
let expandingId: string | null = $state(null);

// Pre-computed clusters state
let clusters: EventCluster[] = $state([]);
let clustersLoading: boolean = $state(false);
let clustersError: string | null = $state(null);
let clustersHasMore: boolean = $state(true);
let clustersPage: number = $state(1);
let unclusteredArticleIds: string[] = $state([]);

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
     */
    async fetchClusters(page: number = 1, category?: string): Promise<void> {
      clustersLoading = true;
      clustersError = null;
      try {
        const result = await api.fetchClusters({ page, limit: 20, category });

        if (!result.success) {
          clustersError = result.error?.type || 'fetch_failed';
          return;
        }

        const incoming: EventCluster[] = result.data?.clusters || [];

        if (page === 1) {
          clusters = incoming;
          unclusteredArticleIds = result.data?.unclustered_article_ids || [];
        } else {
          clusters = [...clusters, ...incoming];
        }

        clustersHasMore = incoming.length >= 20;
        clustersPage = page;
      } catch (e) {
        clustersError = (e as Error).message;
      } finally {
        clustersLoading = false;
      }
    },

    /** Load next page of clusters. */
    async loadMoreClusters(category?: string): Promise<void> {
      if (!clustersLoading && clustersHasMore) {
        await this.fetchClusters(clustersPage + 1, category);
      }
    },

    /** Refresh clusters from page 1. */
    async refreshClusters(category?: string): Promise<void> {
      await this.fetchClusters(1, category);
    },

    // ==========================================
    // Legacy Events (backward compat)
    // ==========================================

    /**
     * Fetch event clusters with pagination.
     */
    async fetchEvents(page: number = 1): Promise<void> {
      loading = true;
      error = null;
      try {
        const result = await api.fetchEvents({ page, limit: 20 });

        if (!result.success) {
          error = result.error?.type || 'fetch_failed';
          return;
        }

        const eventsData = result.data as { items?: BlindspotEvent[]; events?: BlindspotEvent[] } | null;
        const incoming: BlindspotEvent[] = eventsData?.items || eventsData?.events || [];

        if (page === 1) {
          events = incoming;
        } else {
          events = [...events, ...incoming];
        }

        hasMore = incoming.length >= 20;
        currentPage = page;
      } catch (e) {
        error = (e as Error).message;
      } finally {
        loading = false;
      }
    },

    /** Load next page of events. */
    async loadMore(): Promise<void> {
      if (!loading && hasMore) {
        await this.fetchEvents(currentPage + 1);
      }
    },

    /**
     * Expand an event cluster by searching for its articles.
     * Uses search API as workaround (GET /events/{id} returns 500).
     * Truncates title to avoid backend 500 on long Chinese queries.
     * Only caches if results were found; empty results allow retry.
     */
    async expandEvent(clusterId: string, title: string): Promise<void> {
      if (expandedArticles[clusterId]?.length > 0) return;

      expandingId = clusterId;
      try {
        // Truncate title: long Chinese queries cause backend 500.
        // Try 15 chars first, fallback to 8 chars if no results.
        const shortTitle = (title || '').slice(0, 15);
        let result = await api.searchArticles(shortTitle);
        let searchData = result.success
          ? (result.data as { articles?: Article[]; items?: Article[] } | null)
          : null;
        let articles: Article[] = searchData?.articles || searchData?.items || [];

        // Fallback: try shorter query if no results
        if (articles.length === 0 && shortTitle.length > 8) {
          const shorterTitle = (title || '').slice(0, 8);
          result = await api.searchArticles(shorterTitle);
          searchData = result.success
            ? (result.data as { articles?: Article[]; items?: Article[] } | null)
            : null;
          articles = searchData?.articles || searchData?.items || [];
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
     */
    collapseEvent(clusterId: string): void {
      const { [clusterId]: _, ...rest } = expandedArticles;
      expandedArticles = rest;
    },

    /**
     * Get expanded articles for a cluster.
     */
    getExpandedArticles(clusterId: string): Article[] | undefined {
      return expandedArticles[clusterId];
    },

    /** Refresh events from page 1. */
    async refreshEvents(): Promise<void> {
      await this.fetchEvents(1);
    }
  };
}
