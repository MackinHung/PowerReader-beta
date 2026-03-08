/**
 * PowerReader - Profile Page (Main Entry)
 *
 * Displays user points, contribution history, 30-day trend,
 * and account actions (export, delete, logout).
 *
 * Split into:
 *   profile-points.js        — Points KPI card + sparkline chart
 *   profile-contributions.js — Contribution history + account actions
 *   profile-helpers.js       — Shared utilities (date formatting)
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Routes: #/profile
 * Auth required: Yes (redirects to login prompt if not authenticated)
 */

import { t } from '../../locale/zh-TW.js';
import { fetchUserMe, fetchUserPoints, API_BASE } from '../api.js';
import { getAuthToken, requireConsent } from '../auth.js';
import { renderPointsSummary, renderPointsError, renderTrendSection } from './profile-points.js';
import { renderContributionSection, renderAccountActions } from './profile-contributions.js';

/**
 * Render profile page.
 * @param {HTMLElement} container
 */
export async function renderProfile(container) {
  container.innerHTML = '';

  const token = getAuthToken();

  // Not logged in — show login prompt
  if (!token) {
    renderLoginPrompt(container);
    return;
  }

  // Loading state
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.setAttribute('role', 'status');
  loadingEl.textContent = t('common.label.loading');
  container.appendChild(loadingEl);

  // Fetch user data + points in parallel
  const [userResult, pointsResult] = await Promise.all([
    fetchUserMe(token),
    fetchUserPoints(token)
  ]);

  container.innerHTML = '';

  // Page title
  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = t('nav.title.profile');
  container.appendChild(title);

  // User info header
  if (userResult.success && userResult.data) {
    renderUserHeader(container, userResult.data);
  }

  // Points summary card
  if (pointsResult.success && pointsResult.data) {
    renderPointsSummary(container, pointsResult.data);
  } else {
    renderPointsError(container);
  }

  // 30-day trend chart
  renderTrendSection(container, token);

  // Contribution history
  renderContributionSection(container, token);

  // Account actions
  renderAccountActions(container, token);
}

/**
 * Render login prompt for unauthenticated users.
 */
function renderLoginPrompt(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'profile-login';

  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = t('nav.title.profile');
  wrapper.appendChild(title);

  const promptText = document.createElement('p');
  promptText.className = 'profile-login__prompt';
  promptText.textContent = t('login.prompt');
  wrapper.appendChild(promptText);

  // Derive API origin from API_BASE
  const apiOrigin = API_BASE.replace(/\/api\/v1$/, '');

  const googleBtn = document.createElement('button');
  googleBtn.className = 'btn btn--primary profile-login__google';
  googleBtn.textContent = t('login.google_oauth');
  googleBtn.addEventListener('click', () => {
    requireConsent(() => {
      window.location.href = `${apiOrigin}/api/v1/auth/google?redirect=${encodeURIComponent(window.location.origin + '/' + window.location.hash)}`;
    });
  });
  wrapper.appendChild(googleBtn);

  const browseBtn = document.createElement('button');
  browseBtn.className = 'btn btn--text';
  browseBtn.textContent = t('login.anonymous_browse');
  browseBtn.addEventListener('click', () => {
    window.location.hash = '#/';
  });
  wrapper.appendChild(browseBtn);

  container.appendChild(wrapper);
}

/**
 * Render user info header.
 */
function renderUserHeader(container, user) {
  const header = document.createElement('div');
  header.className = 'profile-header';

  const avatar = document.createElement('div');
  avatar.className = 'profile-header__avatar';
  avatar.textContent = (user.display_name || '?').charAt(0).toUpperCase();
  avatar.setAttribute('aria-hidden', 'true');
  header.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'profile-header__info';

  const name = document.createElement('p');
  name.className = 'profile-header__name';
  name.textContent = user.display_name || t('profile.anonymous');
  info.appendChild(name);

  const role = document.createElement('span');
  role.className = 'profile-header__role';
  role.textContent = t(`profile.role.${user.role || 'contributor'}`);
  info.appendChild(role);

  header.appendChild(info);
  container.appendChild(header);
}
