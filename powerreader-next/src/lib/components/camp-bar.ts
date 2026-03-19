/**
 * Camp bar component (vanilla JS).
 * Stub — will be replaced by Svelte component integration.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { CampRatio } from '../types/index.js';

export function createCampBar(campData: CampRatio): HTMLElement {
  const el = document.createElement('div');
  el.className = 'camp-bar';
  return el;
}
