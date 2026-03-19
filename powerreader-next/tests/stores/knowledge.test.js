/**
 * Unit tests for knowledge.svelte.js (Knowledge Store)
 *
 * Tests cover: loadKnowledge, entries filtering, getEntry,
 *              setType, setParty, setSearch, clearFilters
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fetch ──
const mockEntries = [
  { id: 'p1', type: 'politician', title: 'Person A', content: 'Bio of A', party: 'KMT' },
  { id: 'p2', type: 'politician', title: 'Person B', content: 'Bio of B', party: 'DPP' },
  { id: 'e1', type: 'event', title: 'Event X', content: 'Details of event X', party: null },
  { id: 't1', type: 'term', title: 'Term Y', content: 'Definition of term Y', party: null },
  { id: 'm1', type: 'media', title: 'Media Z', content: 'About media Z', party: null }
];

const mockResponse = {
  generated_at: '2026-03-19T00:00:00Z',
  total: mockEntries.length,
  types: { politician: 2, event: 1, term: 1, media: 1 },
  parties: { KMT: 1, DPP: 1 },
  entries: mockEntries
};

let store;

async function loadModule() {
  vi.resetModules();

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockResponse)
  });

  const mod = await import('../../src/lib/stores/knowledge.svelte.js');
  return mod.getKnowledgeStore();
}

beforeEach(async () => {
  store = await loadModule();
});

describe('Knowledge Store', () => {
  describe('loadKnowledge', () => {
    it('loads entries from static JSON', async () => {
      await store.loadKnowledge();

      expect(store.loaded).toBe(true);
      expect(store.allEntries).toHaveLength(5);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('is idempotent — does not refetch if already loaded', async () => {
      await store.loadKnowledge();
      await store.loadKnowledge();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('sets error on fetch failure', async () => {
      vi.resetModules();
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const mod = await import('../../src/lib/stores/knowledge.svelte.js');
      const failStore = mod.getKnowledgeStore();
      await failStore.loadKnowledge();

      expect(failStore.loaded).toBe(false);
      expect(failStore.error).toBeTruthy();
    });

    it('handles network error', async () => {
      vi.resetModules();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network fail'));

      const mod = await import('../../src/lib/stores/knowledge.svelte.js');
      const failStore = mod.getKnowledgeStore();
      await failStore.loadKnowledge();

      expect(failStore.error).toBe('network fail');
      expect(failStore.loaded).toBe(false);
    });

    it('populates typeCounts and partyCounts', async () => {
      await store.loadKnowledge();

      expect(store.typeCounts).toEqual({ politician: 2, event: 1, term: 1, media: 1 });
      expect(store.partyCounts).toEqual({ KMT: 1, DPP: 1 });
    });
  });

  describe('entries (filtered)', () => {
    beforeEach(async () => {
      await store.loadKnowledge();
    });

    it('returns all entries when no filter is active', () => {
      expect(store.entries).toHaveLength(5);
    });

    it('filters by type', () => {
      store.setType('politician');
      expect(store.entries).toHaveLength(2);
      expect(store.entries.every(e => e.type === 'politician')).toBe(true);
    });

    it('filters by party', () => {
      store.setParty('KMT');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].party).toBe('KMT');
    });

    it('filters by search query (title)', () => {
      store.setSearch('Person A');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('p1');
    });

    it('filters by search query (content)', () => {
      store.setSearch('definition');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('t1');
    });

    it('combines type + party + search filters', () => {
      store.setType('politician');
      store.setParty('DPP');
      store.setSearch('Person');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('p2');
    });

    it('returns empty when no match', () => {
      store.setSearch('nonexistent xyz');
      expect(store.entries).toHaveLength(0);
    });

    it('search is case-insensitive', () => {
      store.setSearch('PERSON A');
      expect(store.entries).toHaveLength(1);
    });
  });

  describe('getEntry', () => {
    it('finds entry by id', async () => {
      await store.loadKnowledge();

      const entry = store.getEntry('e1');
      expect(entry).toBeDefined();
      expect(entry.title).toBe('Event X');
    });

    it('returns undefined for unknown id', async () => {
      await store.loadKnowledge();

      expect(store.getEntry('nonexistent')).toBeUndefined();
    });
  });

  describe('clearFilters', () => {
    it('resets all filters', async () => {
      await store.loadKnowledge();
      store.setType('politician');
      store.setParty('KMT');
      store.setSearch('test');

      store.clearFilters();

      expect(store.activeType).toBe('all');
      expect(store.activeParty).toBe('all');
      expect(store.searchQuery).toBe('');
      expect(store.entries).toHaveLength(5);
    });
  });
});
