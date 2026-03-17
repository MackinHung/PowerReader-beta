/**
 * PowerReader - Authentication Helpers
 *
 * Manages JWT token storage and retrieval.
 * Token is stored in localStorage (persists across sessions).
 *
 * Security notes:
 * - JWT is RS256 signed (asymmetric, per shared/config.js SECURITY)
 * - Token TTL: 30 days
 * - Cross-verify with session ID on server side
 * - Never log or expose token content to UI
 *
 * NOTE: DOM manipulation (requireConsent) removed for SvelteKit migration.
 * Consent UI is now handled by Svelte components.
 */

const TOKEN_KEY = 'powerreader_token';
const SESSION_KEY = 'powerreader_session';
const CONSENT_KEY = 'powerreader_privacy_consent';
const USER_HASH_KEY = 'powerreader_user_hash';

/**
 * Get stored JWT token.
 * @returns {string|null} JWT token or null if not logged in
 */
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get stored session ID.
 * @returns {string|null}
 */
export function getSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

/**
 * Store authentication credentials after OAuth callback.
 * Also extracts user_hash from JWT payload for client-side use.
 * @param {string} token - JWT token
 * @param {string} sessionId - Session ID
 */
export function setAuthCredentials(token, sessionId) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SESSION_KEY, sessionId);

  // Extract user_hash from JWT payload (base64 decode, no verification needed)
  const userHash = extractUserHashFromJwt(token);
  if (userHash) {
    localStorage.setItem(USER_HASH_KEY, userHash);
  }
}

/**
 * Extract user_hash from JWT payload without verification.
 * Server always re-verifies JWT — this is for client-side display only.
 * @param {string} token - JWT string
 * @returns {string|null} user_hash or null
 */
function extractUserHashFromJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.user_hash || payload.sub || null;
  } catch {
    return null;
  }
}

/**
 * Clear all authentication data (logout).
 */
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_HASH_KEY);
}

/**
 * Get stored user_hash (extracted from JWT on login).
 * For already-logged-in users missing user_hash, re-extracts from stored token.
 * @returns {string|null}
 */
export function getUserHash() {
  let hash = localStorage.getItem(USER_HASH_KEY);
  if (!hash) {
    // Backfill: re-extract from stored token for existing sessions
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      hash = extractUserHashFromJwt(token);
      if (hash) localStorage.setItem(USER_HASH_KEY, hash);
    }
  }
  return hash;
}

/**
 * Check if a JWT token's exp claim is in the past.
 * @param {string} token - JWT string
 * @returns {boolean} true if expired or unparseable
 */
function isTokenExpired(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false; // No exp claim = never expires
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Check if user is currently authenticated with a non-expired token.
 * If token exists but is expired, clears auth and returns false.
 * @returns {boolean}
 */
export function isAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearAuth();
    return false;
  }
  return true;
}

/**
 * Check if user has given privacy consent.
 * @returns {boolean}
 */
export function hasPrivacyConsent() {
  return localStorage.getItem(CONSENT_KEY) === '1';
}

/**
 * Record that user has given privacy consent.
 */
export function setPrivacyConsent() {
  localStorage.setItem(CONSENT_KEY, '1');
}
