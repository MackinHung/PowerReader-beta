/**
 * PowerReader - Settings Page Helpers
 *
 * Pure formatting functions used by settings.js.
 * Extracted for testability and i18n consistency.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../i18n/zh-TW.js';

/**
 * Format VRAM size for display.
 * Shows GB for >= 1024 MB, MB otherwise, "無法偵測" for 0/falsy.
 *
 * @param {number|null|undefined} mb - VRAM in megabytes
 * @returns {string} Human-readable VRAM string
 */
export function formatVRAM(mb) {
  if (!mb) return t('settings.hw.vram_unknown');

  if (mb >= 1024) {
    const gb = mb / 1024;
    // Remove trailing .0 for exact values
    const formatted = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
    return `${formatted} GB`;
  }

  return `${mb} MB`;
}

/**
 * Format ISO 8601 date string to human-readable TW locale.
 *
 * @param {string|null|undefined} isoString
 * @returns {string} Formatted date or "—"
 */
export function formatBenchmarkDate(isoString) {
  if (!isoString) return '—';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';

    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Format benchmark mode for display.
 *
 * @param {string} mode - 'gpu' | 'cpu' | 'none'
 * @returns {{ text: string, color: string }}
 */
export function formatBenchmarkMode(mode) {
  if (mode === 'gpu') {
    return { text: t('settings.hw.mode_gpu'), color: 'var(--color-controversy-low)' };
  }
  if (mode === 'cpu') {
    return { text: t('settings.hw.mode_cpu'), color: 'var(--color-text-secondary)' };
  }
  return { text: t('settings.hw.mode_none'), color: 'var(--color-bias-extreme)' };
}

/**
 * Create a label-value info row element.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} [color]
 * @returns {HTMLElement}
 */
export function createInfoRow(label, value, color) {
  const row = document.createElement('div');
  row.className = 'settings-about__row';

  const labelEl = document.createElement('span');
  labelEl.className = 'settings-about__label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'settings-about__value';
  valueEl.textContent = value;
  if (color) valueEl.style.color = color;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}
