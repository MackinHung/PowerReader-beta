/**
 * PowerReader - Profile Points Summary & Sparkline
 *
 * Renders the points KPI card and 30-day contribution trend chart.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { fetchUserContributions } from '../api.js';
import { formatDateShort } from './profile-helpers.js';

/**
 * Render points summary card.
 */
export function renderPointsSummary(container, points) {
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
export function renderPointsError(container) {
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
 * Render 30-day trend section with SVG sparkline.
 */
export async function renderTrendSection(container, token) {
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
