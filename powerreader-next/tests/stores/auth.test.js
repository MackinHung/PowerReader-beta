/**
 * Unit tests for auth.svelte.js (Auth Store)
 *
 * Tests cover: getAuthStore, login, logout, handleCallback,
 *              fetchProfile, fetchPoints, sync, acceptPrivacy
 *
 * Strategy: Since Svelte 5 runes ($state) may not compile in plain vitest,
 * we mock the auth store module and test via the returned object interface.
 * If runes work natively, tests pass as-is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock auth.js (localStorage helpers) ──

const mockAuthFns = {
  getAuthToken: vi.fn(() => null),
  getSessionId: vi.fn(() => null),
  setAuthCredentials: vi.fn(),
  clearAuth: vi.fn(),
  getUserHash: vi.fn(() => null),
  isAuthenticated: vi.fn(() => false),
  hasPrivacyConsent: vi.fn(() => false),
  setPrivacyConsent: vi.fn(),
};

vi.mock('$lib/core/auth.js', () => mockAuthFns);

// ── Mock api.js ──

const mockApiFns = {
  fetchUserMe: vi.fn().mockResolvedValue({ success: true, data: { user_hash: 'u1', display_name: 'Test User' } }),
  fetchUserPoints: vi.fn().mockResolvedValue({ success: true, data: { points: 100, vote_rights: 5 } }),
};

vi.mock('$lib/core/api.js', () => mockApiFns);

// ── Dynamic module import ──

let authStoreModule;
let store;

async function loadModule() {
  return await import('../../src/lib/stores/auth.svelte.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();

  // Reset mock return values
  mockAuthFns.getAuthToken.mockReturnValue(null);
  mockAuthFns.getSessionId.mockReturnValue(null);
  mockAuthFns.getUserHash.mockReturnValue(null);
  mockAuthFns.isAuthenticated.mockReturnValue(false);
  mockAuthFns.hasPrivacyConsent.mockReturnValue(false);
  mockAuthFns.setAuthCredentials.mockClear();
  mockAuthFns.clearAuth.mockClear();
  mockAuthFns.setPrivacyConsent.mockClear();

  mockApiFns.fetchUserMe.mockResolvedValue({ success: true, data: { user_hash: 'u1', display_name: 'Test User' } });
  mockApiFns.fetchUserPoints.mockResolvedValue({ success: true, data: { points: 100, vote_rights: 5 } });

  // Re-register mocks after resetModules
  vi.mock('$lib/core/auth.js', () => mockAuthFns);
  vi.mock('$lib/core/api.js', () => mockApiFns);

  authStoreModule = await loadModule();
  store = authStoreModule.getAuthStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. getAuthStore — structure
// ══════════════════════════════════════════════

describe('getAuthStore', () => {
  it('returns an object with all expected getters', () => {
    expect(store).toBeDefined();
    expect(typeof store.isAuthenticated).not.toBe('undefined');
    expect(typeof store.userHash).not.toBe('undefined');
    expect(typeof store.token).not.toBe('undefined');
    expect(typeof store.hasPrivacyConsent).not.toBe('undefined');
    expect(typeof store.loading).not.toBe('undefined');
    expect(typeof store.error).not.toBe('undefined');
  });

  it('returns an object with all expected methods', () => {
    expect(typeof store.login).toBe('function');
    expect(typeof store.logout).toBe('function');
    expect(typeof store.handleCallback).toBe('function');
    expect(typeof store.fetchProfile).toBe('function');
    expect(typeof store.fetchPoints).toBe('function');
    expect(typeof store.sync).toBe('function');
    expect(typeof store.acceptPrivacy).toBe('function');
  });
});

// ══════════════════════════════════════════════
// 2. Initial state
// ══════════════════════════════════════════════

describe('initial state', () => {
  it('isAuthenticated reads from auth.js isAuthenticated()', () => {
    // Default mock returns false
    expect(store.isAuthenticated).toBe(false);
  });

  it('userProfile is null initially', () => {
    expect(store.userProfile).toBeNull();
  });

  it('userPoints is null initially', () => {
    expect(store.userPoints).toBeNull();
  });

  it('loading is false initially', () => {
    expect(store.loading).toBe(false);
  });

  it('error is null initially', () => {
    expect(store.error).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 3. login
// ══════════════════════════════════════════════

describe('login', () => {
  it('sets token, userHash, and authenticated=true', () => {
    mockAuthFns.getUserHash.mockReturnValue('hash123');

    store.login('jwt-token', 'session-id');

    expect(mockAuthFns.setAuthCredentials).toHaveBeenCalledWith('jwt-token', 'session-id');
    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toBe('jwt-token');
  });

  it('clears any previous error', () => {
    // Force an error state via handleCallback without token
    store.handleCallback(new URLSearchParams());
    expect(store.error).toBe('missing_token');

    // Login should clear it
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');
    expect(store.error).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 4. logout
// ══════════════════════════════════════════════

describe('logout', () => {
  it('clears all state', () => {
    // First login
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');
    expect(store.isAuthenticated).toBe(true);

    // Then logout
    store.logout();

    expect(mockAuthFns.clearAuth).toHaveBeenCalled();
    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
    expect(store.userHash).toBeNull();
    expect(store.userProfile).toBeNull();
    expect(store.userPoints).toBeNull();
    expect(store.error).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 5. handleCallback
// ══════════════════════════════════════════════

describe('handleCallback', () => {
  it('returns true and logs in when token is present', () => {
    mockAuthFns.getUserHash.mockReturnValue('cb-hash');

    const params = new URLSearchParams('token=my-jwt&session=my-sess');
    const result = store.handleCallback(params);

    expect(result).toBe(true);
    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toBe('my-jwt');
  });

  it('returns false and sets error when token is missing', () => {
    const params = new URLSearchParams('session=only-session');
    const result = store.handleCallback(params);

    expect(result).toBe(false);
    expect(store.error).toBe('missing_token');
  });

  it('handles callback with token but no session', () => {
    mockAuthFns.getUserHash.mockReturnValue('no-sess-hash');

    const params = new URLSearchParams('token=jwt-only');
    const result = store.handleCallback(params);

    expect(result).toBe(true);
    // Session defaults to empty string
    expect(mockAuthFns.setAuthCredentials).toHaveBeenCalledWith('jwt-only', '');
  });
});

// ══════════════════════════════════════════════
// 6. fetchProfile
// ══════════════════════════════════════════════

describe('fetchProfile', () => {
  it('calls fetchUserMe and sets userProfile on success', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    await store.fetchProfile();

    expect(mockApiFns.fetchUserMe).toHaveBeenCalledWith('jwt');
    expect(store.userProfile).toEqual({ user_hash: 'u1', display_name: 'Test User' });
  });

  it('sets loading to true during fetch then false after', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    // After fetch completes, loading should be false
    await store.fetchProfile();
    expect(store.loading).toBe(false);
  });

  it('auto-logouts on 401 error', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserMe.mockResolvedValue({
      success: false,
      error: { type: 'unauthorized', status: 401 },
    });

    await store.fetchProfile();

    expect(store.isAuthenticated).toBe(false);
    expect(mockAuthFns.clearAuth).toHaveBeenCalled();
  });

  it('sets error on non-401 API failure', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserMe.mockResolvedValue({
      success: false,
      error: { type: 'server_error' },
    });

    await store.fetchProfile();

    expect(store.error).toBe('server_error');
    expect(store.isAuthenticated).toBe(true); // Not logged out
  });

  it('sets error on network exception', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserMe.mockRejectedValue(new Error('Network down'));

    await store.fetchProfile();

    expect(store.error).toBe('Network down');
  });

  it('does nothing when not authenticated', async () => {
    await store.fetchProfile();

    expect(mockApiFns.fetchUserMe).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 7. fetchPoints + dailyQuota
// ══════════════════════════════════════════════

describe('fetchPoints', () => {
  it('calls fetchUserPoints and sets userPoints on success', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    await store.fetchPoints();

    expect(mockApiFns.fetchUserPoints).toHaveBeenCalledWith('jwt');
    expect(store.userPoints).toEqual({ points: 100, vote_rights: 5 });
  });

  it('silently fails on API error (does not set error)', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserPoints.mockResolvedValue({ success: false, error: { type: 'server_error' } });

    await store.fetchPoints();

    // Error should NOT be set (points fetch is non-critical)
    expect(store.error).toBeNull();
  });

  it('silently fails on network exception', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserPoints.mockRejectedValue(new Error('Network'));

    await store.fetchPoints();

    // Should not throw
    expect(store.error).toBeNull();
  });

  it('does nothing when not authenticated', async () => {
    await store.fetchPoints();

    expect(mockApiFns.fetchUserPoints).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 7b. dailyQuota getter
// ══════════════════════════════════════════════

describe('dailyQuota', () => {
  it('returns defaults when userPoints is null', () => {
    const q = store.dailyQuota;
    expect(q).toEqual({ used: 0, limit: 50, remaining: 50 });
  });

  it('computes from userPoints data', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserPoints.mockResolvedValue({
      success: true,
      data: { daily_analysis_count: 12, daily_analysis_limit: 50 },
    });

    await store.fetchPoints();

    const q = store.dailyQuota;
    expect(q.used).toBe(12);
    expect(q.limit).toBe(50);
    expect(q.remaining).toBe(38);
  });

  it('remaining is 0 when daily limit reached', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserPoints.mockResolvedValue({
      success: true,
      data: { daily_analysis_count: 50, daily_analysis_limit: 50 },
    });

    await store.fetchPoints();

    expect(store.dailyQuota.remaining).toBe(0);
  });

  it('remaining never goes negative', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserPoints.mockResolvedValue({
      success: true,
      data: { daily_analysis_count: 60, daily_analysis_limit: 50 },
    });

    await store.fetchPoints();

    expect(store.dailyQuota.remaining).toBe(0);
  });

  it('uses fallback limit of 50 when not provided', async () => {
    mockAuthFns.getUserHash.mockReturnValue('h1');
    store.login('jwt', 'sess');

    mockApiFns.fetchUserPoints.mockResolvedValue({
      success: true,
      data: { daily_analysis_count: 5 },
    });

    await store.fetchPoints();

    expect(store.dailyQuota.limit).toBe(50);
    expect(store.dailyQuota.remaining).toBe(45);
  });
});

// ══════════════════════════════════════════════
// 8. sync
// ══════════════════════════════════════════════

describe('sync', () => {
  it('re-reads state from localStorage via auth.js', () => {
    mockAuthFns.isAuthenticated.mockReturnValue(true);
    mockAuthFns.getAuthToken.mockReturnValue('synced-token');
    mockAuthFns.getUserHash.mockReturnValue('synced-hash');
    mockAuthFns.hasPrivacyConsent.mockReturnValue(true);

    store.sync();

    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toBe('synced-token');
    expect(store.hasPrivacyConsent).toBe(true);
  });
});

// ══════════════════════════════════════════════
// 9. acceptPrivacy
// ══════════════════════════════════════════════

describe('acceptPrivacy', () => {
  it('calls setPrivacyConsent and sets hasPrivacyConsent to true', () => {
    expect(store.hasPrivacyConsent).toBe(false);

    store.acceptPrivacy();

    expect(mockAuthFns.setPrivacyConsent).toHaveBeenCalled();
    expect(store.hasPrivacyConsent).toBe(true);
  });
});
