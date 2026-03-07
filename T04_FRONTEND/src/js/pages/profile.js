/**
 * PowerReader - Profile Page
 *
 * Displays user points, contribution history, 30-day trend,
 * and account actions (export, delete, logout).
 *
 * Routes: #/profile
 *
 * Auth required: Yes (redirects to login prompt if not authenticated)
 */

import { t } from '../../locale/zh-TW.js';
import { fetchUserMe, fetchUserPoints, fetchUserContributions } from '../api.js';
import { getAuthToken, requireConsent, clearAuth } from '../auth.js';

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

  // 30-day trend chart placeholder
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

  const googleBtn = document.createElement('button');
  googleBtn.className = 'btn btn--primary profile-login__google';
  googleBtn.textContent = t('login.google_oauth');
  googleBtn.addEventListener('click', () => {
    requireConsent(() => {
      window.location.href = '/api/v1/auth/google?redirect=' + encodeURIComponent(window.location.hash);
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

/**
 * Render points summary card.
 */
function renderPointsSummary(container, points) {
  const card = document.createElement('section');
  card.className = 'profile-points';
  card.setAttribute('aria-label', t('reward.title'));

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('reward.title');
  card.appendChild(heading);

  // KPI grid
  const grid = document.createElement('div');
  grid.className = 'profile-points__grid';

  const kpis = [
    { label: t('profile.kpi.total_points'), value: points.display_points || '0.00' },
    { label: t('profile.kpi.vote_rights'), value: String(points.vote_rights || 0) },
    { label: t('profile.kpi.contributions'), value: String(points.contribution_count || 0) },
    { label: t('profile.kpi.daily_analyses'), value: String(points.daily_analysis_count || 0) }
  ];

  for (const kpi of kpis) {
    const item = document.createElement('div');
    item.className = 'profile-points__kpi';

    const val = document.createElement('span');
    val.className = 'profile-points__kpi-value';
    val.textContent = kpi.value;

    const label = document.createElement('span');
    label.className = 'profile-points__kpi-label';
    label.textContent = kpi.label;

    item.appendChild(val);
    item.appendChild(label);
    grid.appendChild(item);
  }

  card.appendChild(grid);

  // Conversion hint
  const hint = document.createElement('p');
  hint.className = 'profile-points__hint';
  hint.textContent = t('reward.conversion_hint');
  card.appendChild(hint);

  // Last contribution date
  if (points.last_contribution_at) {
    const lastDate = document.createElement('p');
    lastDate.className = 'profile-points__last';
    lastDate.textContent = t('profile.last_contribution', {
      date: formatDateShort(points.last_contribution_at)
    });
    card.appendChild(lastDate);
  }

  container.appendChild(card);
}

/**
 * Render error state for points.
 */
function renderPointsError(container) {
  const card = document.createElement('section');
  card.className = 'profile-points profile-points--error';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('reward.title');
  card.appendChild(heading);

  const msg = document.createElement('p');
  msg.className = 'error-state';
  msg.textContent = t('error.message.generic');
  card.appendChild(msg);

  container.appendChild(card);
}

/**
 * Render 30-day trend section.
 * Loads contribution data then draws a simple SVG sparkline.
 */
async function renderTrendSection(container, token) {
  const section = document.createElement('section');
  section.className = 'profile-trend';
  section.setAttribute('aria-label', t('a11y.chart.points_trend'));

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('profile.trend.title');
  section.appendChild(heading);

  const chartSlot = document.createElement('div');
  chartSlot.className = 'profile-trend__chart';
  chartSlot.setAttribute('role', 'img');
  chartSlot.setAttribute('aria-label', t('a11y.chart.points_trend'));
  section.appendChild(chartSlot);

  container.appendChild(section);

  // Load trend data
  const result = await fetchUserContributions(token, { days: 30 });
  if (!result.success || !result.data?.daily_counts) {
    chartSlot.textContent = t('common.label.no_data');
    return;
  }

  drawSparkline(chartSlot, result.data.daily_counts);
}

/**
 * Draw simple SVG sparkline.
 * @param {HTMLElement} container
 * @param {number[]} values - Array of daily counts (30 days)
 */
function drawSparkline(container, values) {
  if (!values.length) {
    container.textContent = t('common.label.no_data');
    return;
  }

  const width = 300;
  const height = 60;
  const padding = 4;
  const maxVal = Math.max(...values, 1);

  const points = values.map((v, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (v / maxVal) * (height - padding * 2);
    return `${x},${y}`;
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('aria-hidden', 'true');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'var(--color-primary)');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  // Fill area below the line
  const areaPoints = [
    `${padding},${height - padding}`,
    ...points,
    `${width - padding},${height - padding}`
  ];
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('points', areaPoints.join(' '));
  area.setAttribute('fill', 'var(--color-primary)');
  area.setAttribute('fill-opacity', '0.1');
  svg.appendChild(area);

  container.appendChild(svg);
}

/**
 * Render contribution history section.
 */
async function renderContributionSection(container, token) {
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
function renderAccountActions(container, token) {
  const section = document.createElement('section');
  section.className = 'profile-actions';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('profile.actions.title');
  section.appendChild(heading);

  // Export data
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--secondary profile-actions__btn';
  exportBtn.textContent = t('profile.actions.export');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = t('common.label.loading');
    try {
      const response = await fetch('/api/v1/user/me/export', {
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
      await fetch('/api/v1/user/me', {
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

/**
 * Format date as short Taiwan locale string.
 */
function formatDateShort(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('zh-TW', {
      month: 'short', day: 'numeric'
    });
  } catch (e) {
    return '';
  }
}
