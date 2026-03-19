/**
 * Unit tests for Admin Knowledge API functions
 *
 * Tests cover: fetchKnowledgeList, upsertKnowledgeEntry,
 *              deleteKnowledgeEntry, searchKnowledgeEntries
 *
 * Strategy: Mock fetch at global level, test the api.js functions
 * exported for admin knowledge management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db.js to avoid IDB in tests ──
vi.mock('$lib/core/db.js', () => ({
  openDB: vi.fn().mockResolvedValue({
    transaction: () => ({
      objectStore: () => ({
        get: () => ({ onsuccess: null, onerror: null }),
        put: () => {},
        getAll: () => ({ onsuccess: null, onerror: null })
      }),
      oncomplete: null,
      onerror: null
    }),
    close: () => {}
  })
}));

let api;

async function loadModule() {
  vi.resetModules();
  return await import('../../src/lib/core/api.js');
}

beforeEach(async () => {
  vi.clearAllMocks();
  api = await loadModule();
});

describe('Admin Knowledge API', () => {
  describe('fetchKnowledgeList', () => {
    it('calls GET /knowledge/list with admin key', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            entries: [{ id: 'p1', type: 'politician', title: 'Test' }],
            pagination: { page: 1, limit: 50, total: 1, total_pages: 1 }
          }
        })
      });

      const result = await api.fetchKnowledgeList('test-key');

      expect(result.success).toBe(true);
      expect(result.data.entries).toHaveLength(1);

      const callUrl = globalThis.fetch.mock.calls[0][0];
      expect(callUrl).toContain('/knowledge/list');

      const callOpts = globalThis.fetch.mock.calls[0][1];
      expect(callOpts.headers.Authorization).toBe('Bearer test-key');
    });

    it('passes type and party filters', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { entries: [], pagination: {} } })
      });

      await api.fetchKnowledgeList('key', { type: 'politician', party: 'KMT', page: 2 });

      const callUrl = globalThis.fetch.mock.calls[0][0];
      expect(callUrl).toContain('type=politician');
      expect(callUrl).toContain('party=KMT');
      expect(callUrl).toContain('page=2');
    });

    it('handles auth error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: { type: 'unauthorized' }
        })
      });

      const result = await api.fetchKnowledgeList('bad-key');
      expect(result.success).toBe(false);
      expect(result.error.type).toBe('unauthorized');
    });
  });

  describe('upsertKnowledgeEntry', () => {
    it('calls POST /knowledge/upsert with entry data', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'p1', type: 'politician', embedded: true }
        })
      });

      const entry = {
        id: 'p1',
        type: 'politician',
        title: 'Test Person',
        content: 'Bio',
        party: 'KMT'
      };

      const result = await api.upsertKnowledgeEntry('test-key', entry);

      expect(result.success).toBe(true);
      expect(result.data.embedded).toBe(true);

      const callOpts = globalThis.fetch.mock.calls[0][1];
      expect(callOpts.method).toBe('POST');
      expect(JSON.parse(callOpts.body)).toEqual(entry);
    });

    it('handles validation error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: { type: 'validation_error', message: 'Invalid' }
        })
      });

      const result = await api.upsertKnowledgeEntry('key', { id: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('deleteKnowledgeEntry', () => {
    it('calls DELETE /knowledge/:id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'p1', deleted: true }
        })
      });

      const result = await api.deleteKnowledgeEntry('test-key', 'p1');

      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);

      const callUrl = globalThis.fetch.mock.calls[0][0];
      expect(callUrl).toContain('/knowledge/p1');

      const callOpts = globalThis.fetch.mock.calls[0][1];
      expect(callOpts.method).toBe('DELETE');
    });

    it('handles not found', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { type: 'not_found' }
        })
      });

      const result = await api.deleteKnowledgeEntry('key', 'nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('searchKnowledgeEntries', () => {
    it('calls GET /knowledge/search with query', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            query: 'test',
            results: [{ id: 'p1', score: 0.95, title: 'Test' }],
            total: 1
          }
        })
      });

      const result = await api.searchKnowledgeEntries('key', 'test');

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);

      const callUrl = globalThis.fetch.mock.calls[0][0];
      expect(callUrl).toContain('q=test');
    });

    it('passes type filter and topK', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { results: [] } })
      });

      await api.searchKnowledgeEntries('key', 'query', { topK: 5, type: 'event' });

      const callUrl = globalThis.fetch.mock.calls[0][0];
      expect(callUrl).toContain('topK=5');
      expect(callUrl).toContain('type=event');
    });
  });
});
