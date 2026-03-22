/**
 * Tests for Point Shop API functions
 *
 * Covers: fetchShopItems, purchaseShopItem, fetchInventory, useShopItem
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

let fetchShopItems, purchaseShopItem, fetchInventory, useShopItem;
let fetchSpy;

beforeEach(async () => {
  vi.resetModules();

  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, writable: true, configurable: true });

  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy;

  const api = await import('$lib/core/api.js');
  fetchShopItems = api.fetchShopItems;
  purchaseShopItem = api.purchaseShopItem;
  fetchInventory = api.fetchInventory;
  useShopItem = api.useShopItem;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Mock Data ──

const MOCK_ITEMS = [
  {
    id: 'badge_civic_analyst',
    name_key: 'shop.item.badge_civic_analyst',
    description_key: 'shop.item.badge_civic_analyst_desc',
    cost_cents: 500,
    category: 'cosmetic',
    icon: 'verified',
    is_consumable: 0,
    duration_hours: null,
    max_per_user: 1,
    display_order: 1,
  },
  {
    id: 'quota_boost_10',
    name_key: 'shop.item.quota_boost',
    description_key: 'shop.item.quota_boost_desc',
    cost_cents: 2000,
    category: 'functional',
    icon: 'add_circle',
    is_consumable: 1,
    duration_hours: 24,
    max_per_user: null,
    display_order: 10,
  },
];

const MOCK_INVENTORY = [
  {
    purchase_id: 1,
    item_id: 'badge_civic_analyst',
    cost_cents: 500,
    purchased_at: '2026-03-22T10:00:00Z',
    expires_at: null,
    is_consumed: 0,
    consumed_at: null,
    name_key: 'shop.item.badge_civic_analyst',
    description_key: 'shop.item.badge_civic_analyst_desc',
    category: 'cosmetic',
    icon: 'verified',
    is_consumable: 0,
    is_active: true,
  },
];

// ── fetchShopItems ──

describe('fetchShopItems', () => {
  it('returns shop items on success', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { items: MOCK_ITEMS }, error: null }),
    });

    const result = await fetchShopItems();

    expect(result.success).toBe(true);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0].id).toBe('badge_civic_analyst');
    expect(result.data.items[1].category).toBe('functional');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/point-shop/items');
  });

  it('returns offline error when offline with no cache', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });

    vi.resetModules();
    vi.mock('$lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue(createMockDB()),
    }));
    const api = await import('$lib/core/api.js');

    const result = await api.fetchShopItems();
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });

  it('handles API error gracefully', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'internal_error' },
      }),
    });

    const result = await fetchShopItems();
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('internal_error');
  });

  it('handles network timeout', async () => {
    fetchSpy.mockRejectedValueOnce({ name: 'TimeoutError' });

    const result = await fetchShopItems();
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('timeout');
  });
});

// ── purchaseShopItem ──

describe('purchaseShopItem', () => {
  it('sends POST with item_id and JWT, returns purchase response', async () => {
    const mockResponse = {
      item_id: 'badge_civic_analyst',
      cost_cents: 500,
      remaining_points_cents: 1500,
      display_remaining: '15.00',
      expires_at: null,
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockResponse, error: null }),
    });

    const result = await purchaseShopItem('badge_civic_analyst', 'my-jwt');

    expect(result.success).toBe(true);
    expect(result.data.item_id).toBe('badge_civic_analyst');
    expect(result.data.remaining_points_cents).toBe(1500);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/point-shop/purchase');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer my-jwt');
    expect(JSON.parse(opts.body)).toEqual({ item_id: 'badge_civic_analyst' });
  });

  it('returns insufficient_points error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'insufficient_points', message: 'Not enough points' },
      }),
    });

    const result = await purchaseShopItem('badge_civic_analyst', 'jwt');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('insufficient_points');
  });

  it('returns already_owned error for duplicate', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'already_owned', message: 'You already own this item' },
      }),
    });

    const result = await purchaseShopItem('badge_civic_analyst', 'jwt');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('already_owned');
  });

  it('returns not_found for invalid item', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'not_found', message: 'Item not found or disabled' },
      }),
    });

    const result = await purchaseShopItem('nonexistent_item', 'jwt');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('not_found');
  });
});

// ── fetchInventory ──

describe('fetchInventory', () => {
  it('sends GET with JWT and returns inventory', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { inventory: MOCK_INVENTORY }, error: null }),
    });

    const result = await fetchInventory('jwt-token');

    expect(result.success).toBe(true);
    expect(result.data.inventory).toHaveLength(1);
    expect(result.data.inventory[0].item_id).toBe('badge_civic_analyst');
    expect(result.data.inventory[0].is_active).toBe(true);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/point-shop/inventory');
    expect(opts.headers['Authorization']).toBe('Bearer jwt-token');
  });

  it('returns empty inventory for new user', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { inventory: [] }, error: null }),
    });

    const result = await fetchInventory('jwt-token');
    expect(result.success).toBe(true);
    expect(result.data.inventory).toHaveLength(0);
  });
});

// ── useShopItem ──

describe('useShopItem', () => {
  it('sends POST with purchase_id and JWT, returns success', async () => {
    const mockResponse = {
      purchase_id: 2,
      item_id: 'quota_boost_10',
      effect_applied: true,
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockResponse, error: null }),
    });

    const result = await useShopItem(2, 'jwt');

    expect(result.success).toBe(true);
    expect(result.data.item_id).toBe('quota_boost_10');
    expect(result.data.effect_applied).toBe(true);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/point-shop/use');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ purchase_id: 2 });
  });

  it('returns already_consumed error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'already_consumed', message: 'Item already used' },
      }),
    });

    const result = await useShopItem(1, 'jwt');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('already_consumed');
  });

  it('returns expired error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'expired', message: 'Item has expired' },
      }),
    });

    const result = await useShopItem(5, 'jwt');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('expired');
  });

  it('returns not_found for invalid purchase', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({
        success: false,
        data: null,
        error: { type: 'not_found', message: 'Purchase not found' },
      }),
    });

    const result = await useShopItem(9999, 'jwt');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('not_found');
  });
});
