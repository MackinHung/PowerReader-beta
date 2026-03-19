/**
 * PowerReader - Auth Store (Svelte 5 Runes)
 *
 * Reactive store wrapping auth.js localStorage-backed authentication.
 * Provides login/logout state, user info, and OAuth callback handling.
 */

import type { UserProfile, UserPoints } from '$lib/types/models.js';
import type { DailyQuota } from '$lib/types/stores.js';

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
let authenticated: boolean = $state(isAuthenticated());
let userHash: string | null = $state(getUserHash());
let token: string | null = $state(getAuthToken());
let privacyConsent: boolean = $state(hasPrivacyConsent());
let userProfile: UserProfile | null = $state(null);
let userPoints: UserPoints | null = $state(null);
let loading: boolean = $state(false);
let error: string | null = $state(null);

export function getAuthStore() {
  return {
    // -- Getters --
    get isAuthenticated() { return authenticated; },
    get userHash() { return userHash; },
    get token() { return token; },
    get hasPrivacyConsent() { return privacyConsent; },
    get userProfile() { return userProfile; },
    get userPoints() { return userPoints; },
    get dailyQuota(): DailyQuota {
      const used = userPoints?.daily_analysis_count ?? 0;
      const limit = userPoints?.daily_analysis_limit ?? 50;
      return { used, limit, remaining: Math.max(0, limit - used) };
    },
    get loading() { return loading; },
    get error() { return error; },

    /**
     * Handle OAuth callback with token and session ID.
     * Typically called from the /auth/callback route.
     */
    login(jwt: string, sessionId: string): void {
      setAuthCredentials(jwt, sessionId);
      token = jwt;
      userHash = getUserHash();
      authenticated = true;
      error = null;
    },

    /** Clear all auth data and reset state. */
    logout(): void {
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
     */
    handleCallback(params: URLSearchParams): boolean {
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
    acceptPrivacy(): void {
      setPrivacyConsent();
      privacyConsent = true;
    },

    /**
     * Fetch current user profile from API.
     * Requires authenticated state.
     */
    async fetchProfile(): Promise<void> {
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
        error = (e as Error).message;
      } finally {
        loading = false;
      }
    },

    /**
     * Fetch user points and vote rights from API.
     * Requires authenticated state.
     */
    async fetchPoints(): Promise<void> {
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
    sync(): void {
      authenticated = isAuthenticated();
      token = getAuthToken();
      userHash = getUserHash();
      privacyConsent = hasPrivacyConsent();
    }
  };
}
