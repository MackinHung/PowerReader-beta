/**
 * PowerReader - Events Store (Svelte 5 Runes)
 *
 * Reactive store for event clusters.
 * Fetches paginated events and expands individual clusters
 * via search API (workaround until /events/{id} is fixed).
 */

import * as api from '$lib/core/api.js';

let events = $state([]);
let loading = $state(false);
let error = $state(null);
let hasMore = $state(true);
let currentPage = $state(1);
let expandedArticles = $state({});
let expandingId = $state(null);

export function getEventsStore() {
  return {
    get events() { return events; },
    get loading() { return loading; },
    get error() { return error; },
    get hasMore() { return hasMore; },
    get expandingId() { return expandingId; },

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
     * @param {string} clusterId
     * @param {string} title - Event title to search for
     */
    async expandEvent(clusterId, title) {
      if (expandedArticles[clusterId]) return;

      expandingId = clusterId;
      try {
        const result = await api.searchArticles(title);
        const articles = result.success
          ? (result.data?.articles || result.data?.items || [])
          : [];
        expandedArticles = { ...expandedArticles, [clusterId]: articles };
      } catch {
        expandedArticles = { ...expandedArticles, [clusterId]: [] };
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
