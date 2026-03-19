/**
 * PowerReader - Knowledge Store (Svelte 5 Runes)
 *
 * Reactive store for browsing knowledge base entries.
 * Loads from build-time static JSON (zero API cost).
 * Provides client-side filtering by type, party, and text search.
 */

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
     */
    get entries() {
      let result = allEntries;

      if (activeType !== 'all') {
        result = result.filter(e => e.type === activeType);
      }

      if (activeParty !== 'all') {
        result = result.filter(e => e.type === 'topic' || e.party === activeParty);
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        result = result.filter(e => {
          if ((e.title || '').toLowerCase().includes(q)) return true;
          if (e.type === 'topic' && e.stances) {
            return Object.values(e.stances).some(
              v => (v || '').toLowerCase().includes(q)
            );
          }
          return (e.content || '').toLowerCase().includes(q);
        });
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
