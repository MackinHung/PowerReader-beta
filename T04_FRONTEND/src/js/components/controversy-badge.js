/**
 * PowerReader - Controversy Badge Component
 *
 * Displays controversy level as a colored badge.
 * Colors match THEME_COLORS in shared/enums.js.
 * CSS classes defined in css/main.css (.controversy-badge).
 */

import { t } from '../../locale/zh-TW.js';

/**
 * Map controversy level key to i18n badge key.
 */
const LEVEL_I18N = {
  low: 'controversy.badge.low',
  moderate: 'controversy.badge.moderate',
  high: 'controversy.badge.high',
  very_high: 'controversy.badge.very_high'
};

/**
 * Create a controversy badge element.
 *
 * @param {number} score - Controversy score 0-100
 * @param {string} level - Controversy level key (e.g. "high")
 * @returns {HTMLElement} Badge element
 */
export function createControversyBadge(score, level) {
  const levelLabel = t(LEVEL_I18N[level] || 'controversy.badge.low');

  const badge = document.createElement('span');
  badge.className = `controversy-badge controversy-badge--${level}`;
  badge.textContent = levelLabel;
  badge.setAttribute('aria-label', t('a11y.controversy_badge', { level: levelLabel }));

  return badge;
}

/**
 * Create a controversy meter (bar with fill).
 *
 * @param {number} score - Controversy score 0-100
 * @param {string} level - Controversy level key
 * @returns {HTMLElement} Meter container
 */
export function createControversyMeter(score, level) {
  const levelLabel = t(LEVEL_I18N[level] || 'controversy.badge.low');

  const container = document.createElement('div');
  container.className = 'controversy-meter-wrapper';

  const meter = document.createElement('div');
  meter.className = 'controversy-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-valuenow', String(score));
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-label', t('a11y.controversy_bar', { score, level: levelLabel }));

  const fill = document.createElement('div');
  fill.className = `controversy-meter__fill controversy-meter__fill--${level}`;
  fill.style.width = `${Math.max(0, Math.min(100, score))}%`;

  meter.appendChild(fill);
  container.appendChild(meter);

  // Label
  const label = document.createElement('div');
  label.className = 'controversy-meter__label';

  const levelSpan = document.createElement('span');
  levelSpan.textContent = levelLabel;

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'controversy-meter__score';
  scoreSpan.textContent = `${score}/100`;

  label.appendChild(levelSpan);
  label.appendChild(scoreSpan);
  container.appendChild(label);

  return container;
}
