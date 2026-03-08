/**
 * PowerReader - Profile Contributions & Account Actions
 *
 * Renders contribution history list and account management buttons
 * (export data, logout, delete account).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { fetchUserContributions, API_BASE } from '../api.js';
import { clearAuth } from '../auth.js';
import { formatDateShort } from './profile-helpers.js';

/**
 * Render contribution history section.
 */
export async function renderContributionSection(container, token) {
  const section = document.createElement('section');
  section.className = 'profile-contributions';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('reward.history.title');
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'profile-contributions__list';
  list.setAttribute('role', 'list');

  // Loading state
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.textContent = t('common.label.loading');
  list.appendChild(loadingEl);

  section.appendChild(list);
  container.appendChild(section);

  // Load contributions
  const result = await fetchUserContributions(token, { page: 1, limit: 20 });
  list.innerHTML = '';

  if (!result.success || !result.data?.contributions?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = t('common.label.no_data');
    list.appendChild(empty);
    return;
  }

  for (const contrib of result.data.contributions) {
    const item = document.createElement('div');
    item.className = 'profile-contributions__item';
    item.setAttribute('role', 'listitem');

    // Date
    const dateEl = document.createElement('time');
    dateEl.className = 'profile-contributions__date';
    dateEl.textContent = formatDateShort(contrib.created_at);
    item.appendChild(dateEl);

    // Article title (clickable)
    const titleEl = document.createElement('span');
    titleEl.className = 'profile-contributions__title';
    titleEl.textContent = contrib.article_title || '';
    if (contrib.article_id) {
      titleEl.style.cursor = 'pointer';
      titleEl.setAttribute('tabindex', '0');
      titleEl.setAttribute('role', 'link');
      const goToArticle = () => {
        window.location.hash = `#/article/${contrib.article_id}`;
      };
      titleEl.addEventListener('click', goToArticle);
      titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToArticle();
        }
      });
    }
    item.appendChild(titleEl);

    // Status badge
    const statusBadge = document.createElement('span');
    statusBadge.className = `profile-contributions__status profile-contributions__status--${contrib.status || 'pending'}`;
    statusBadge.textContent = t(`reward.status.${contrib.status || 'pending'}`);
    item.appendChild(statusBadge);

    // Points earned
    if (contrib.points_earned != null) {
      const pointsEl = document.createElement('span');
      pointsEl.className = 'profile-contributions__points';
      pointsEl.textContent = `+${(contrib.points_earned / 100).toFixed(2)}`;
      item.appendChild(pointsEl);
    }

    list.appendChild(item);
  }
}

/**
 * Render account actions (export, delete, logout).
 */
export function renderAccountActions(container, token) {
  const section = document.createElement('section');
  section.className = 'profile-actions';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('profile.actions.title');
  section.appendChild(heading);

  // Derive API origin from API_BASE
  const apiOrigin = API_BASE.replace(/\/api\/v1$/, '');

  // Export data
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--secondary profile-actions__btn';
  exportBtn.textContent = t('profile.actions.export');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = t('common.label.loading');
    try {
      const response = await fetch(`${apiOrigin}/api/v1/user/me/export`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `powerreader-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Profile] Export failed:', err);
    }
    exportBtn.disabled = false;
    exportBtn.textContent = t('profile.actions.export');
  });
  section.appendChild(exportBtn);

  // Logout
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn--secondary profile-actions__btn';
  logoutBtn.textContent = t('login.logout');
  logoutBtn.addEventListener('click', () => {
    if (window.confirm(t('login.logout_confirm'))) {
      clearAuth();
      window.location.hash = '#/';
      window.location.reload();
    }
  });
  section.appendChild(logoutBtn);

  // Delete account (danger)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--text profile-actions__btn profile-actions__btn--danger';
  deleteBtn.textContent = t('profile.actions.delete');
  deleteBtn.addEventListener('click', async () => {
    if (!window.confirm(t('profile.actions.delete_confirm'))) return;
    if (!window.confirm(t('profile.actions.delete_confirm_final'))) return;
    try {
      await fetch(`${apiOrigin}/api/v1/user/me`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });
      clearAuth();
      window.location.hash = '#/';
      window.location.reload();
    } catch (err) {
      console.error('[Profile] Delete account failed:', err);
    }
  });
  section.appendChild(deleteBtn);

  container.appendChild(section);
}
