/**
 * Controversy badge component (vanilla JS).
 * Stub — will be replaced by Svelte component integration.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

export function createControversyMeter(score: number, level: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'controversy-meter';
  el.dataset.score = String(score);
  el.dataset.level = level;
  return el;
}
