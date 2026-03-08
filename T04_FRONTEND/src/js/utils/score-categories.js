/**
 * PowerReader - Score → Category Mapping (Client-side)
 *
 * SSOT Mirror: Boundaries from shared/config.js ANALYSIS.BIAS_BOUNDARIES
 * and ANALYSIS.CONTROVERSY_BOUNDARIES. If those change, update here.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

// Bias boundaries: [5, 40, 48, 52, 60, 95]
// Categories: extreme_left | left | center_left | center | center_right | right | extreme_right

export function getBiasCategoryFromScore(score) {
  if (score < 5) return 'extreme_left';
  if (score < 40) return 'left';
  if (score < 48) return 'center_left';
  if (score <= 52) return 'center';
  if (score <= 60) return 'center_right';
  if (score <= 95) return 'right';
  return 'extreme_right';
}

// Controversy boundaries: [5, 15, 50]
// Categories: low | moderate | high | very_high

export function getControversyLevelFromScore(score) {
  if (score < 5) return 'low';
  if (score < 15) return 'moderate';
  if (score < 50) return 'high';
  return 'very_high';
}
