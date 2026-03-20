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

export function formatBenchmarkMode(mode: string): { text: string; color: string } {
  if (mode === 'gpu') {
    return { text: t('settings.hw.mode_gpu'), color: '#28A745' };
  }
  if (mode === 'cpu') {
    return { text: t('settings.hw.mode_cpu'), color: 'var(--color-text-secondary)' };
  }
  return { text: t('settings.hw.mode_none'), color: 'var(--color-bias-extreme)' };
}

export function createInfoRow(label: string, value: string, color?: string): HTMLElement {
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
