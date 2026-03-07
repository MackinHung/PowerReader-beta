/**
 * PowerReader - Bias Spectrum Bar Component
 *
 * Visual representation of political bias on a left-right spectrum.
 * Colors match THEME_COLORS in shared/enums.js.
 * CSS classes defined in css/main.css (.bias-bar, .bias-bar__indicator).
 *
 * Accessibility:
 *   - role="img" with descriptive aria-label
 *   - Pattern fills for prefers-contrast: more (colorblind safe)
 *   - Numeric score always shown as text fallback
 */

import { t } from '../../locale/zh-TW.js';

/**
 * Map bias category key to i18n label key.
 */
const CATEGORY_I18N = {
  extreme_left: 'bias.label.extreme_left',
  left: 'bias.label.left',
  center_left: 'bias.label.center_left',
  center: 'bias.label.center',
  center_right: 'bias.label.center_right',
  right: 'bias.label.right',
  extreme_right: 'bias.label.extreme_right'
};

/**
 * Create a bias spectrum bar element.
 *
 * @param {number} score - Bias score 0-100 (0=deep green, 100=deep blue)
 * @param {string} category - Bias category key (e.g. "center_left")
 * @returns {HTMLElement} Bias bar container element
 */
export function createBiasBar(score, category) {
  const categoryLabel = t(CATEGORY_I18N[category] || 'bias.label.center');
  const a11yLabel = t('a11y.bias_bar', { score, category: categoryLabel });

  const wrapper = document.createElement('div');
  wrapper.className = 'bias-bar-wrapper';

  // Spectrum bar
  const bar = document.createElement('div');
  bar.className = 'bias-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', a11yLabel);

  // Indicator dot
  const indicator = document.createElement('div');
  indicator.className = 'bias-bar__indicator';
  indicator.style.left = `${Math.max(0, Math.min(100, score))}%`;

  bar.appendChild(indicator);
  wrapper.appendChild(bar);

  // Text label beneath bar
  const label = document.createElement('div');
  label.className = 'bias-bar__label';

  const categorySpan = document.createElement('span');
  categorySpan.className = 'bias-bar__category';
  categorySpan.textContent = categoryLabel;

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'bias-bar__score';
  scoreSpan.textContent = String(score);

  label.appendChild(categorySpan);
  label.appendChild(scoreSpan);
  wrapper.appendChild(label);

  return wrapper;
}

/**
 * Create a compact inline bias indicator (for article cards).
 *
 * @param {number} score - Bias score 0-100
 * @param {string} category - Bias category key
 * @returns {HTMLElement} Compact bias element
 */
export function createBiasIndicator(score, category) {
  const categoryLabel = t(CATEGORY_I18N[category] || 'bias.label.center');

  const el = document.createElement('span');
  el.className = `bias-indicator bias-indicator--${category}`;
  el.textContent = categoryLabel;
  el.setAttribute('aria-label', t('a11y.article_card.bias', { category: categoryLabel, score }));

  return el;
}
