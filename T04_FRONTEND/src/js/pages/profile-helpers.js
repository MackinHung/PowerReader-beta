/**
 * PowerReader - Profile Helpers
 *
 * Shared utility functions for profile sub-modules.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

/**
 * Format date as short Taiwan locale string.
 */
export function formatDateShort(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('zh-TW', {
      month: 'short', day: 'numeric'
    });
  } catch (e) {
    return '';
  }
}
