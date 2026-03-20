/**
 * PowerReader - Knowledge Store (Svelte 5 Runes)
 *
 * Reactive store for browsing knowledge base entries.
 * Loads from build-time static JSON (zero API cost).
 * Provides client-side filtering by type, party, and text search.
 *
 * Schema v2: figure/issue/incident types with backward compat for
 * legacy politician/topic/event names.
 */

import { isFigureType, isIssueType, isIncidentType } from '$lib/utils/knowledge-constants.js';

let allEntries = $state([]);
let loading = $state(false);
let error = $state(null);
let loaded = $state(false);
let activeType = $state('all');
let activeParty = $state('all');
let searchQuery = $state('');
let typeCounts = $state({});
let partyCounts = $state({});

export function getKnowledgeStore() {
  return {
    get allEntries() { return allEntries; },
    get loading() { return loading; },
    get error() { return error; },
    get loaded() { return loaded; },
    get activeType() { return activeType; },
    get activeParty() { return activeParty; },
    get searchQuery() { return searchQuery; },
    get typeCounts() { return typeCounts; },
    get partyCounts() { return partyCounts; },

    /**
     * Filtered entries based on current type, party, and search query.
     * Supports both new (figure/issue/incident) and legacy (politician/topic/event) type names.
     */
    get entries() {
      let result = allEntries;

      if (activeType !== 'all') {
        result = result.filter(e => matchesTypeFilter(e.type, activeType));
      }

      if (activeParty !== 'all') {
        // Issue/topic entries always pass through party filter (their party info is in stances)
        result = result.filter(e => isIssueType(e.type) || e.party === activeParty);
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        result = result.filter(e => searchEntryMatches(e, q));
      }

      return result;
    },

    /**
     * Load knowledge from static JSON. Idempotent — skips if already loaded.
     */
    async loadKnowledge() {
      if (loaded || loading) return;

      loading = true;
      error = null;

      try {
        const response = await fetch('/data/knowledge.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        allEntries = data.entries || [];
        typeCounts = data.types || {};
        partyCounts = data.parties || {};
        loaded = true;
      } catch (e) {
        error = e.message;
      } finally {
        loading = false;
      }
    },

    /**
     * Look up a single entry by ID.
     * @param {string} id
     * @returns {Object|undefined}
     */
    getEntry(id) {
      return allEntries.find(e => e.id === id);
    },

    /**
     * Set active type filter.
     * @param {string} type - 'all' or entry type key
     */
    setType(type) {
      activeType = type;
      // Reset party filter when switching to a type without party data
      if (type !== 'all' && !isFigureType(type) && !isIssueType(type)) {
        activeParty = 'all';
      }
    },

    /**
     * Set active party filter.
     * @param {string} party - 'all' or party key
     */
    setParty(party) {
      activeParty = party;
    },

    /**
     * Set search query.
     * @param {string} query
     */
    setSearch(query) {
      searchQuery = query;
    },

    /**
     * Clear all filters and search.
     */
    clearFilters() {
      activeType = 'all';
      activeParty = 'all';
      searchQuery = '';
    }
  };
}

/**
 * Match an entry type against the active filter, handling both
 * new (figure/issue/incident) and legacy (politician/topic/event) names.
 */
function matchesTypeFilter(entryType, filterType) {
  if (entryType === filterType) return true;
  if (isFigureType(filterType) && isFigureType(entryType)) return true;
  if (isIssueType(filterType) && isIssueType(entryType)) return true;
  if (isIncidentType(filterType) && isIncidentType(entryType)) return true;
  return false;
}

/**
 * Full-text search across all relevant fields of an entry.
 * Searches title, content, period, background, experience, description,
 * keywords, and stances.
 */
function searchEntryMatches(entry, query) {
  if ((entry.title || '').toLowerCase().includes(query)) return true;
  if ((entry.content || '').toLowerCase().includes(query)) return true;

  // Figure sub-fields
  if ((entry.period || '').toLowerCase().includes(query)) return true;
  if ((entry.background || '').toLowerCase().includes(query)) return true;

  // Issue/Incident description
  if ((entry.description || '').toLowerCase().includes(query)) return true;

  // Issue stances
  if (entry.stances) {
    if (Object.values(entry.stances).some(v => (v || '').toLowerCase().includes(query))) {
      return true;
    }
  }

  // Incident keywords
  if (Array.isArray(entry.keywords)) {
    if (entry.keywords.some(k => (k || '').toLowerCase().includes(query))) {
      return true;
    }
  }

  return false;
}
