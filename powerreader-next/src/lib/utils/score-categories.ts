/**
 * PowerReader - Score -> Category Mapping (Client-side)
 *
 * SSOT Mirror: Boundaries from shared/config.js ANALYSIS.BIAS_BOUNDARIES
 * and ANALYSIS.CONTROVERSY_BOUNDARIES. If those change, update here.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { BiasCategory } from '$lib/types/models.js';

// Bias boundaries: [5, 40, 48, 52, 60, 95]
// Categories: extreme_left | left | center_left | center | center_right | right | extreme_right

export function getBiasCategoryFromScore(score: number): BiasCategory {
  if (score < 5) return 'extreme_left';
  if (score < 40) return 'left';
  if (score < 48) return 'center_left';
  if (score <= 52) return 'center';
  if (score <= 60) return 'center_right';
  if (score <= 95) return 'right';
  return 'extreme_right';
}
