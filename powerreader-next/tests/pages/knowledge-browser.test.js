/**
 * Unit tests for Knowledge Browser page logic
 *
 * Tests cover: loading, type/party/search filtering, navigation
 *
 * Strategy: Since the page component depends on SvelteKit $app modules,
 * we test the knowledge store integration and page-level filtering logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEntries = [
  { id: 'p1', type: 'politician', title: 'Person A', content: 'Bio of Person A', party: 'KMT' },
  { id: 'p2', type: 'politician', title: 'Person B', content: 'Bio of Person B', party: 'DPP' },
  { id: 'p3', type: 'politician', title: 'Person C', content: 'Bio of Person C', party: 'TPP' },
  { id: 'e1', type: 'event', title: 'Event Alpha', content: 'Details about Alpha', party: null },
  { id: 't1', type: 'term', title: 'Term Beta', content: 'Definition of Beta', party: null },
  { id: 'm1', type: 'media', title: 'Media Gamma', content: 'Info about Gamma', party: null }
];

const mockResponse = {
  generated_at: '2026-03-19T00:00:00Z',
  total: mockEntries.length,
  types: { politician: 3, event: 1, term: 1, media: 1 },
  parties: { KMT: 1, DPP: 1, TPP: 1 },
  entries: mockEntries
};

let store;

async function loadStore() {
  vi.resetModules();

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockResponse)
  });

  const mod = await import('../../src/lib/stores/knowledge.svelte.js');
  const s = mod.getKnowledgeStore();
  await s.loadKnowledge();
  return s;
}

beforeEach(async () => {
  store = await loadStore();
});

describe('Knowledge Browser Integration', () => {
  it('loads all entries from static JSON', () => {
    expect(store.allEntries).toHaveLength(6);
    expect(store.loaded).toBe(true);
  });

  it('fetches from /data/knowledge.json', () => {
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/knowledge.json');
  });

  it('shows correct type counts', () => {
    expect(store.typeCounts.politician).toBe(3);
    expect(store.typeCounts.event).toBe(1);
    expect(store.typeCounts.term).toBe(1);
    expect(store.typeCounts.media).toBe(1);
  });

  describe('type filter', () => {
    it('filters to politicians only', () => {
      store.setType('politician');
      expect(store.entries).toHaveLength(3);
      expect(store.entries.every(e => e.type === 'politician')).toBe(true);
    });

    it('filters to events only', () => {
      store.setType('event');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('e1');
    });

    it('shows all when type is "all"', () => {
      store.setType('politician');
      store.setType('all');
      expect(store.entries).toHaveLength(6);
    });
  });

  describe('party filter', () => {
    it('filters to KMT', () => {
      store.setParty('KMT');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].party).toBe('KMT');
    });

    it('filters to DPP', () => {
      store.setParty('DPP');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].party).toBe('DPP');
    });

    it('combined type + party', () => {
      store.setType('politician');
      store.setParty('TPP');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('p3');
    });
  });

  describe('search filter', () => {
    it('searches by title', () => {
      store.setSearch('Alpha');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('e1');
    });

    it('searches by content', () => {
      store.setSearch('Definition');
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].id).toBe('t1');
    });

    it('search is case-insensitive', () => {
      store.setSearch('person a');
      expect(store.entries).toHaveLength(1);
    });

    it('combined type + search', () => {
      store.setType('politician');
      store.setSearch('Person');
      expect(store.entries).toHaveLength(3);
    });

    it('empty search returns all (within type/party)', () => {
      store.setSearch('xyz');
      expect(store.entries).toHaveLength(0);
      store.setSearch('');
      expect(store.entries).toHaveLength(6);
    });
  });

  describe('getEntry for detail page', () => {
    it('returns entry by id', () => {
      const entry = store.getEntry('p1');
      expect(entry.title).toBe('Person A');
      expect(entry.party).toBe('KMT');
    });

    it('returns undefined for nonexistent id', () => {
      expect(store.getEntry('nope')).toBeUndefined();
    });
  });

  describe('clearFilters', () => {
    it('resets all filters and shows all entries', () => {
      store.setType('event');
      store.setParty('KMT');
      store.setSearch('xyz');

      store.clearFilters();

      expect(store.activeType).toBe('all');
      expect(store.activeParty).toBe('all');
      expect(store.searchQuery).toBe('');
      expect(store.entries).toHaveLength(6);
    });
  });
});
