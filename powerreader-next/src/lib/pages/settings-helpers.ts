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

export function formatVRAM(mb: number | null | undefined): string {
  if (!mb) return t('settings.hw.vram_unknown');

  if (mb >= 1024) {
    const gb = mb / 1024;
    // Remove trailing .0 for exact values
    const formatted = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
    return `${formatted} GB`;
  }

  return `${mb} MB`;
}

export function formatBenchmarkDate(isoString: string | null | undefined): string {
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

