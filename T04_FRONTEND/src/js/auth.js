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
 */

import { t } from '../locale/zh-TW.js';

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
 * Check if user is currently authenticated.
 * Does NOT validate token — server validates on each request.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!localStorage.getItem(TOKEN_KEY);
}

/**
 * Check if user has given privacy consent.
 * @returns {boolean}
 */
export function hasPrivacyConsent() {
  return localStorage.getItem(CONSENT_KEY) === '1';
}

/**
 * Show privacy consent dialog before proceeding with OAuth.
 * If consent already given, calls onConsent immediately.
 * @param {Function} onConsent - Callback after user consents
 */
export function requireConsent(onConsent) {
  if (hasPrivacyConsent()) {
    onConsent();
    return;
  }

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'consent-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('privacy.consent.title'));

  const dialog = document.createElement('div');
  dialog.className = 'consent-dialog';

  const heading = document.createElement('h3');
  heading.textContent = t('privacy.consent.title');
  dialog.appendChild(heading);

  // Privacy policy link
  const policyLink = document.createElement('a');
  policyLink.className = 'consent-dialog__link';
  policyLink.href = '#/privacy';
  policyLink.target = '_blank';
  policyLink.rel = 'noopener';
  policyLink.textContent = t('privacy.consent.link');
  dialog.appendChild(policyLink);

  // Checkbox
  const label = document.createElement('label');
  label.className = 'consent-dialog__checkbox';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';

  const labelText = document.createElement('span');
  labelText.textContent = t('privacy.consent.checkbox');

  label.appendChild(checkbox);
  label.appendChild(labelText);
  dialog.appendChild(label);

  // Error hint (hidden initially)
  const hint = document.createElement('p');
  hint.className = 'consent-dialog__hint';
  hint.hidden = true;
  hint.textContent = t('privacy.consent.required');
  dialog.appendChild(hint);

  // Buttons
  const actions = document.createElement('div');
  actions.className = 'consent-dialog__actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary';
  confirmBtn.textContent = t('privacy.consent.button');
  confirmBtn.addEventListener('click', () => {
    if (!checkbox.checked) {
      hint.hidden = false;
      return;
    }
    localStorage.setItem(CONSENT_KEY, '1');
    overlay.remove();
    onConsent();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--text';
  cancelBtn.textContent = t('nav.button.back');
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus trap
  checkbox.focus();
}
