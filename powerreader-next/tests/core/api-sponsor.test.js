/**
 * Tests for sponsor API functions
 *
 * Covers: createSponsorOrder, fetchSponsorStats, fetchMySponsorships
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock IndexedDB via db.js ──

function createMockStore(data = {}) {
  const store = {
    _data: { ...data },
    put(item) {
      const key = item.article_hash || item.cache_key || item.key;
      store._data[key] = item;
      return { onsuccess: null, onerror: null };
    },
    get(key) {
      const req = {
        result: store._data[key] || undefined,
        onsuccess: null,
        onerror: null,
      };
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
    getAll() {
      const req = {
        result: Object.values(store._data),
        onsuccess: null,
        onerror: null,
      };
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
  };
  return store;
}

function createMockDB(stores = {}) {
  return {
    transaction(storeName, mode) {
      const store = stores[storeName] || createMockStore();
      if (!stores[storeName]) stores[storeName] = store;
      const tx = {
        objectStore: () => store,
        oncomplete: null,
        onerror: null,
      };
      Promise.resolve().then(() => tx.oncomplete?.());
      return tx;
    },
    close() {},
  };
}

vi.mock('$lib/core/db.js', () => ({
  openDB: vi.fn().mockResolvedValue(createMockDB()),
}));

// ── Test Setup ──

let createSponsorOrder, fetchSponsorStats, fetchMySponsorships;
let fetchSpy;

beforeEach(async () => {
  vi.resetModules();

  // Default: online
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, writable: true, configurable: true });

  // Mock fetch
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy;

  const api = await import('$lib/core/api.js');
  createSponsorOrder = api.createSponsorOrder;
  fetchSponsorStats = api.fetchSponsorStats;
  fetchMySponsorships = api.fetchMySponsorships;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──

describe('createSponsorOrder', () => {
  it('sends POST with correct body and returns form_params', async () => {
    const mockData = {
      form_params: { MerchantID: '3002607', CheckMacValue: 'ABC123' },
      action_url: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData, error: null }),
    });

    const result = await createSponsorOrder({ amount: 100, type: 'coffee' });

    expect(result.success).toBe(true);
    expect(result.data.form_params.MerchantID).toBe('3002607');
    expect(result.data.action_url).toContain('ecpay');

    // Verify fetch call
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/sponsor/create');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ amount: 100, type: 'coffee' });
  });

  it('includes Authorization header when token provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { form_params: {}, action_url: '' }, error: null }),
    });

    await createSponsorOrder({ amount: 60, type: 'civic' }, 'my-jwt-token');

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('does not include Authorization header without token', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { form_params: {}, action_url: '' }, error: null }),
    });

    await createSponsorOrder({ amount: 60, type: 'civic' });

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('returns error for validation failure', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'validation_error', message: 'Amount must be >= 30' },
      }),
    });

    const result = await createSponsorOrder({ amount: 10, type: 'coffee' });
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('validation_error');
  });
});

describe('fetchSponsorStats', () => {
  it('returns stats data on success', async () => {
    const mockStats = {
      total_amount: 1500,
      total_count: 10,
      by_type: {
        coffee: { count: 5, amount: 500 },
        civic: { count: 3, amount: 600 },
        compute: { count: 1, amount: 300 },
        proxy: { count: 1, amount: 100 },
      },
      pools: { developer: 400, platform: 700, compute: 400 },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockStats, error: null }),
    });

    const result = await fetchSponsorStats();

    expect(result.success).toBe(true);
    expect(result.data.total_amount).toBe(1500);
    expect(result.data.pools.developer).toBe(400);
    expect(result.data.by_type.coffee.count).toBe(5);
  });

  it('returns offline error when offline', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });

    // Re-import to pick up the navigator change
    vi.resetModules();
    vi.mock('$lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue(createMockDB()),
    }));
    const api = await import('$lib/core/api.js');

    const result = await api.fetchSponsorStats();
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

describe('fetchMySponsorships', () => {
  it('sends GET with JWT and returns sponsorship list', async () => {
    const mockData = {
      sponsorships: [
        { merchant_trade_no: 'PR001', amount: 100, sponsor_type: 'coffee', status: 'paid', created_at: '2026-03-21', paid_at: '2026-03-21' },
      ],
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData, error: null }),
    });

    const result = await fetchMySponsorships('jwt-token');

    expect(result.success).toBe(true);
    expect(result.data.sponsorships).toHaveLength(1);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/sponsor/me');
    expect(opts.headers['Authorization']).toBe('Bearer jwt-token');
  });
});
