/**
 * Unit tests for auth.ts
 *
 * Tests cover: getAuthToken, getSessionId, setAuthCredentials,
 *              clearAuth, getUserHash, isAuthenticated,
 *              hasPrivacyConsent, setPrivacyConsent,
 *              JWT extraction, token expiry
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAuthToken,
  getSessionId,
  setAuthCredentials,
  clearAuth,
  getUserHash,
  isAuthenticated,
  hasPrivacyConsent,
  setPrivacyConsent,
} from '../../src/lib/core/auth.js';

// Helper: create a fake JWT with given payload
function fakeJwt(payload) {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

describe('auth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── getAuthToken / getSessionId ──

  describe('getAuthToken', () => {
    it('returns null when no token stored', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('returns stored token', () => {
      localStorage.setItem('powerreader_token', 'abc123');
      expect(getAuthToken()).toBe('abc123');
    });
  });

  describe('getSessionId', () => {
    it('returns null when no session stored', () => {
      expect(getSessionId()).toBeNull();
    });

    it('returns stored session', () => {
      localStorage.setItem('powerreader_session', 'sess-1');
      expect(getSessionId()).toBe('sess-1');
    });
  });

  // ── setAuthCredentials ──

  describe('setAuthCredentials', () => {
    it('stores token and session', () => {
      const token = fakeJwt({ user_hash: 'u123' });
      setAuthCredentials(token, 'sess-2');
      expect(localStorage.getItem('powerreader_token')).toBe(token);
      expect(localStorage.getItem('powerreader_session')).toBe('sess-2');
    });

    it('extracts and stores user_hash from JWT', () => {
      const token = fakeJwt({ user_hash: 'hash-abc' });
      setAuthCredentials(token, 'sess-3');
      expect(localStorage.getItem('powerreader_user_hash')).toBe('hash-abc');
    });

    it('uses sub as fallback when user_hash missing', () => {
      const token = fakeJwt({ sub: 'sub-xyz' });
      setAuthCredentials(token, 'sess-4');
      expect(localStorage.getItem('powerreader_user_hash')).toBe('sub-xyz');
    });

    it('does not store user_hash when JWT has no user_hash or sub', () => {
      const token = fakeJwt({ foo: 'bar' });
      setAuthCredentials(token, 'sess-5');
      expect(localStorage.getItem('powerreader_user_hash')).toBeNull();
    });

    it('handles malformed JWT gracefully (no crash)', () => {
      setAuthCredentials('not-a-jwt', 'sess-6');
      expect(localStorage.getItem('powerreader_token')).toBe('not-a-jwt');
      expect(localStorage.getItem('powerreader_user_hash')).toBeNull();
    });

    it('handles JWT with only 2 parts', () => {
      setAuthCredentials('part1.part2', 'sess-7');
      expect(localStorage.getItem('powerreader_user_hash')).toBeNull();
    });
  });

  // ── clearAuth ──

  describe('clearAuth', () => {
    it('removes token, session, and user_hash', () => {
      localStorage.setItem('powerreader_token', 'tok');
      localStorage.setItem('powerreader_session', 'sess');
      localStorage.setItem('powerreader_user_hash', 'hash');
      clearAuth();
      expect(localStorage.getItem('powerreader_token')).toBeNull();
      expect(localStorage.getItem('powerreader_session')).toBeNull();
      expect(localStorage.getItem('powerreader_user_hash')).toBeNull();
    });

    it('does not throw when nothing to clear', () => {
      expect(() => clearAuth()).not.toThrow();
    });
  });

  // ── getUserHash ──

  describe('getUserHash', () => {
    it('returns null when no hash and no token', () => {
      expect(getUserHash()).toBeNull();
    });

    it('returns stored hash directly', () => {
      localStorage.setItem('powerreader_user_hash', 'direct-hash');
      expect(getUserHash()).toBe('direct-hash');
    });

    it('backfills hash from stored JWT when hash missing', () => {
      const token = fakeJwt({ user_hash: 'backfill-hash' });
      localStorage.setItem('powerreader_token', token);
      expect(getUserHash()).toBe('backfill-hash');
      // Also verifies backfill persists
      expect(localStorage.getItem('powerreader_user_hash')).toBe('backfill-hash');
    });

    it('returns null when JWT has no user_hash or sub', () => {
      const token = fakeJwt({ role: 'admin' });
      localStorage.setItem('powerreader_token', token);
      expect(getUserHash()).toBeNull();
    });
  });

  // ── isAuthenticated ──

  describe('isAuthenticated', () => {
    it('returns false when no token', () => {
      expect(isAuthenticated()).toBe(false);
    });

    it('returns true with valid non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const token = fakeJwt({ user_hash: 'u1', exp: futureExp });
      localStorage.setItem('powerreader_token', token);
      expect(isAuthenticated()).toBe(true);
    });

    it('returns false and clears auth when token is expired', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const token = fakeJwt({ user_hash: 'u2', exp: pastExp });
      localStorage.setItem('powerreader_token', token);
      localStorage.setItem('powerreader_session', 'sess');
      expect(isAuthenticated()).toBe(false);
      expect(localStorage.getItem('powerreader_token')).toBeNull();
      expect(localStorage.getItem('powerreader_session')).toBeNull();
    });

    it('returns true when token has no exp claim (never expires)', () => {
      const token = fakeJwt({ user_hash: 'u3' });
      localStorage.setItem('powerreader_token', token);
      expect(isAuthenticated()).toBe(true);
    });

    it('returns false for malformed JWT', () => {
      localStorage.setItem('powerreader_token', 'bad-token');
      expect(isAuthenticated()).toBe(false);
    });

    it('returns false for JWT with invalid base64 payload', () => {
      localStorage.setItem('powerreader_token', 'a.!!!invalid!!!.c');
      expect(isAuthenticated()).toBe(false);
    });
  });

  // ── Privacy consent ──

  describe('hasPrivacyConsent', () => {
    it('returns false when no consent stored', () => {
      expect(hasPrivacyConsent()).toBe(false);
    });

    it('returns true when consent is "1"', () => {
      localStorage.setItem('powerreader_privacy_consent', '1');
      expect(hasPrivacyConsent()).toBe(true);
    });

    it('returns false for other values', () => {
      localStorage.setItem('powerreader_privacy_consent', 'yes');
      expect(hasPrivacyConsent()).toBe(false);
    });
  });

  describe('setPrivacyConsent', () => {
    it('stores consent as "1"', () => {
      setPrivacyConsent();
      expect(localStorage.getItem('powerreader_privacy_consent')).toBe('1');
    });
  });
});
