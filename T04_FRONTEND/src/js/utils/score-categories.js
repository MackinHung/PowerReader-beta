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

// Controversy boundaries: [20, 40, 60, 80] — aligned with prompt 5-level scale
// 0-20: non_political (非政治或日常社會)
// 21-40: general_policy (一般政策)
// 41-60: partisan_clash (藍綠交鋒)
// 61-80: core_conflict (核心對立議題)
// 81-100: national_security (國安外交重大爭議)

export function getControversyLevelFromScore(score) {
  if (score <= 20) return 'non_political';
  if (score <= 40) return 'general_policy';
  if (score <= 60) return 'partisan_clash';
  if (score <= 80) return 'core_conflict';
  return 'national_security';
}
