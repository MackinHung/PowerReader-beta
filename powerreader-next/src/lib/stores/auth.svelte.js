/**
 * PowerReader - Auth Store (Svelte 5 Runes)
 *
 * Reactive store wrapping auth.js localStorage-backed authentication.
 * Provides login/logout state, user info, and OAuth callback handling.
 */

import {
  getAuthToken,
  getSessionId,
  setAuthCredentials,
  clearAuth,
  getUserHash,
  isAuthenticated,
  hasPrivacyConsent,
  setPrivacyConsent
} from '$lib/core/auth.js';

import { fetchUserMe, fetchUserPoints } from '$lib/core/api.js';

// -- Reactive state (initialized from localStorage) --
let authenticated = $state(isAuthenticated());
let userHash = $state(getUserHash());
let token = $state(getAuthToken());
let privacyConsent = $state(hasPrivacyConsent());
let userProfile = $state(null);
let userPoints = $state(null);
let loading = $state(false);
let error = $state(null);

export function getAuthStore() {
  return {
    // -- Getters --
    get isAuthenticated() { return authenticated; },
    get userHash() { return userHash; },
    get token() { return token; },
    get hasPrivacyConsent() { return privacyConsent; },
    get userProfile() { return userProfile; },
    get userPoints() { return userPoints; },
    get dailyQuota() {
      const used = userPoints?.daily_analysis_count ?? 0;
      const limit = userPoints?.daily_analysis_limit ?? 50;
      return { used, limit, remaining: Math.max(0, limit - used) };
    },
    get loading() { return loading; },
    get error() { return error; },

    /**
     * Handle OAuth callback with token and session ID.
     * Typically called from the /auth/callback route.
     * @param {string} jwt - JWT token from server
     * @param {string} sessionId - Session ID
     */
    login(jwt, sessionId) {
      setAuthCredentials(jwt, sessionId);
      token = jwt;
      userHash = getUserHash();
      authenticated = true;
      error = null;
    },

    /** Clear all auth data and reset state. */
    logout() {
      clearAuth();
      token = null;
      userHash = null;
      authenticated = false;
      userProfile = null;
      userPoints = null;
      error = null;
    },

    /**
     * Handle OAuth callback from URL parameters.
     * Extracts token and session from URL hash or query params.
     * @param {URLSearchParams} params
     * @returns {boolean} true if login succeeded
     */
    handleCallback(params) {
      const jwt = params.get('token');
      const sessionId = params.get('session');

      if (!jwt) {
        error = 'missing_token';
        return false;
      }

      this.login(jwt, sessionId || '');
      return true;
    },

    /** Record privacy consent. */
    acceptPrivacy() {
      setPrivacyConsent();
      privacyConsent = true;
    },

    /**
     * Fetch current user profile from API.
     * Requires authenticated state.
     */
    async fetchProfile() {
      if (!authenticated || !token) return;

      loading = true;
      error = null;
      try {
        const result = await fetchUserMe(token);
        if (result.success) {
          userProfile = result.data;
        } else {
          error = result.error?.type || 'profile_fetch_failed';
          if (result.error?.status === 401) {
            this.logout();
          }
        }
      } catch (e) {
        error = e.message;
      } finally {
        loading = false;
      }
    },

    /**
     * Fetch user points and vote rights from API.
     * Requires authenticated state.
     */
    async fetchPoints() {
      if (!authenticated || !token) return;

      try {
        const result = await fetchUserPoints(token);
        if (result.success) {
          userPoints = result.data;
        }
      } catch (e) {
        // Points fetch is non-critical; silently fail
      }
    },

    /**
     * Re-sync reactive state from localStorage.
     * Useful after page reload or external auth changes.
     */
    sync() {
      authenticated = isAuthenticated();
      token = getAuthToken();
      userHash = getUserHash();
      privacyConsent = hasPrivacyConsent();
    }
  };
}
