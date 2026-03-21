/**
 * PowerReader - Device Detection Utilities
 *
 * Pure utility functions for mobile device detection.
 * Zero DOM side effects.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

const MOBILE_UA_PATTERN = /Android|iPhone|iPad|iPod|Mobile|webOS/i;

/**
 * Detect whether the current device is a mobile device.
 * Uses a 2-of-3 heuristic to avoid single-condition false positives:
 *   1. UA string matches mobile patterns
 *   2. Touch points > 0
 *   3. Screen width < 1024
 */
export function isMobileDevice(): boolean {
  let signals = 0;

  if (MOBILE_UA_PATTERN.test(navigator.userAgent)) signals++;
  if (navigator.maxTouchPoints > 0) signals++;
  if (screen.width < 1024) signals++;

  return signals >= 2;
}
