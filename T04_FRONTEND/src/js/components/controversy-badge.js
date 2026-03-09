/**
 * PowerReader - Controversy Badge & Meter Component
 *
 * 5-level controversy scale aligned with prompt definition:
 * 0-20: 非政治或日常社會 (non_political)
 * 21-40: 一般政策 (general_policy)
 * 41-60: 政黨交鋒 (partisan_clash)
 * 61-80: 核心對立議題 (core_conflict)
 * 81-100: 國安外交重大爭議 (national_security)
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

const LEVEL_LABELS = {
  non_political: '非政治',
  general_policy: '一般政策',
  partisan_clash: '政黨交鋒',
  core_conflict: '核心對立',
  national_security: '國安外交',
  // Legacy 4-level fallback
  low: '非政治',
  moderate: '一般政策',
  high: '政黨交鋒',
  very_high: '核心對立'
};

/**
 * Create a controversy badge element.
 *
 * @param {number} score - Controversy score 0-100
 * @param {string} level - Controversy level key
 * @returns {HTMLElement} Badge element
 */
export function createControversyBadge(score, level) {
  const levelLabel = LEVEL_LABELS[level] || level;

  const badge = document.createElement('span');
  badge.className = `controversy-badge controversy-badge--${level}`;
  badge.textContent = levelLabel;
  badge.setAttribute('aria-label', `爭議程度：${levelLabel}`);

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
  const levelLabel = LEVEL_LABELS[level] || level;

  const container = document.createElement('div');
  container.className = 'controversy-meter-wrapper';

  const meter = document.createElement('div');
  meter.className = 'controversy-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-valuenow', String(score));
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-label', `爭議程度 ${score} 分，${levelLabel}`);

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
