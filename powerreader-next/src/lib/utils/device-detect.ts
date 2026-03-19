/**
 * PowerReader - Device Detection Utilities
 *
 * Pure utility functions for mobile device detection and
 * browser WebGPU compatibility checking. Zero DOM side effects.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { BrowserInfo } from '$lib/types/inference.js';

const MOBILE_UA_PATTERN = /Android|iPhone|iPad|iPod|Mobile|webOS/i;

const WEBGPU_BROWSER_REQUIREMENTS: Record<string, number> = {
  Chrome: 113,
  Edge: 113,
  Firefox: Infinity, // experimental, flag required
  Safari: Infinity   // not supported
};

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

/**
 * Parse browser name and version from the user agent string.
 * Returns WebGPU compatibility information.
 */
export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = 0;

  // Order matters: Edge UA includes "Chrome", so check Edge first
  if (/Edg\/(\d+)/.test(ua)) {
    name = 'Edge';
    version = parseInt(RegExp.$1, 10);
  } else if (/Chrome\/(\d+)/.test(ua)) {
    name = 'Chrome';
    version = parseInt(RegExp.$1, 10);
  } else if (/Firefox\/(\d+)/.test(ua)) {
    name = 'Firefox';
    version = parseInt(RegExp.$1, 10);
  } else if (/Version\/(\d+).*Safari/.test(ua)) {
    name = 'Safari';
    version = parseInt(RegExp.$1, 10);
  }

  const minVersion = WEBGPU_BROWSER_REQUIREMENTS[name] || Infinity;
  const isCompatible = version >= minVersion;

  let message = '';
  if (name === 'Firefox') {
    message = 'device.browser_firefox_hint';
  } else if (name === 'Safari') {
    message = 'device.browser_safari_hint';
  } else if (!isCompatible && (name === 'Chrome' || name === 'Edge')) {
    message = 'device.browser_hint';
  }

  return { name, version, webgpuMinVersion: minVersion, isCompatible, message };
}
