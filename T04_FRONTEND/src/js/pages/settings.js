/**
 * PowerReader - Settings Page
 *
 * Model management, cache management, notification toggle,
 * app info and version.
 *
 * Routes: #/settings
 */

import { t } from '../../locale/zh-TW.js';
import { openDB } from '../db.js';
import { isModelDownloaded, deleteModel } from '../model/manager.js';
import { detectBestMode, getModeLabel } from '../model/inference.js';

/**
 * Render settings page.
 * @param {HTMLElement} container
 */
export async function renderSettings(container) {
  container.innerHTML = '';

  // Title
  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = t('nav.title.settings');
  container.appendChild(title);

  // Model management section
  await renderModelSection(container);

  // Cache management section
  await renderCacheSection(container);

  // Display settings (ROC calendar)
  renderDisplaySection(container);

  // Notification toggle
  renderNotificationSection(container);

  // About section
  renderAboutSection(container);
}

/**
 * Render model management section.
 */
async function renderModelSection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('model.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  // Model info
  const nameEl = document.createElement('p');
  nameEl.className = 'settings-card__title';
  nameEl.textContent = t('model.name');
  card.appendChild(nameEl);

  const sizeEl = document.createElement('p');
  sizeEl.className = 'settings-card__subtitle';
  sizeEl.textContent = t('model.size_label');
  card.appendChild(sizeEl);

  // Model status
  const modelReady = await isModelDownloaded();
  const statusEl = document.createElement('p');
  statusEl.className = 'settings-card__status';
  statusEl.textContent = modelReady
    ? t('model.status.downloaded')
    : t('model.status.not_downloaded');
  statusEl.style.color = modelReady
    ? 'var(--color-controversy-low)'
    : 'var(--color-text-secondary)';
  card.appendChild(statusEl);

  // Inference mode (async — detect Ollama, WebGPU, WASM, or server)
  const bestMode = await detectBestMode();
  const modeEl = document.createElement('p');
  modeEl.className = 'settings-card__subtitle';
  modeEl.textContent = getModeLabel(bestMode);
  card.appendChild(modeEl);

  // Actions
  const actionsRow = document.createElement('div');
  actionsRow.className = 'settings-card__actions';

  if (!modelReady) {
    // Download button → navigate to analyze page which handles download
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn btn--primary';
    downloadBtn.textContent = t('model.download.button');
    downloadBtn.setAttribute('aria-label', t('a11y.button.download_model'));
    downloadBtn.addEventListener('click', () => {
      window.location.hash = '#/analyze';
    });
    actionsRow.appendChild(downloadBtn);
  } else {
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--secondary';
    deleteBtn.textContent = t('model.delete.button');
    deleteBtn.setAttribute('aria-label', t('a11y.button.delete_model'));
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(t('model.delete.confirm'))) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = t('common.label.loading');
      await deleteModel();
      // Re-render
      renderSettings(container.parentElement || container);
    });
    actionsRow.appendChild(deleteBtn);
  }

  card.appendChild(actionsRow);
  section.appendChild(card);
  container.appendChild(section);
}

/**
 * Estimate storage usage string.
 * @returns {Promise<string>} Formatted usage or empty string
 */
async function getStorageUsageInfo() {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) return '';
  try {
    const estimate = await navigator.storage.estimate();
    const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
    const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
    return t('settings.cache.usage', { used: usedMB, total: quotaMB });
  } catch (e) {
    return '';
  }
}

/**
 * Count cached articles in IndexedDB.
 * @returns {Promise<number>}
 */
async function getCachedArticleCount() {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const countReq = tx.objectStore('articles').count();
    const count = await new Promise((res, rej) => {
      countReq.onsuccess = () => res(countReq.result);
      countReq.onerror = () => rej(countReq.error);
    });
    db.close();
    return count;
  } catch (e) {
    return 0;
  }
}

/**
 * Clear all cached articles and results from IndexedDB.
 */
async function clearCacheStores() {
  const db = await openDB();
  const tx = db.transaction(['articles', 'cached_results'], 'readwrite');
  tx.objectStore('articles').clear();
  tx.objectStore('cached_results').clear();
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}

/**
 * Render cache management section.
 */
async function renderCacheSection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('settings.cache.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  const storageInfo = await getStorageUsageInfo();
  if (storageInfo) {
    const usageEl = document.createElement('p');
    usageEl.className = 'settings-card__subtitle';
    usageEl.textContent = storageInfo;
    card.appendChild(usageEl);
  }

  const articleCount = await getCachedArticleCount();
  const countEl = document.createElement('p');
  countEl.className = 'settings-card__subtitle';
  countEl.textContent = t('settings.cache.articles', { count: String(articleCount) });
  card.appendChild(countEl);

  // Clear cache button
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn--secondary';
  clearBtn.textContent = t('settings.cache.clear');
  clearBtn.addEventListener('click', async () => {
    if (!window.confirm(t('settings.cache.clear_confirm'))) return;
    clearBtn.disabled = true;
    clearBtn.textContent = t('common.label.loading');
    try {
      await clearCacheStores();
    } catch (e) {
      console.error('[Settings] Clear cache failed:', e);
    }
    renderSettings(container.parentElement || container);
  });
  card.appendChild(clearBtn);
  section.appendChild(card);
  container.appendChild(section);
}

/**
 * Render display settings section (ROC calendar toggle).
 */
function renderDisplaySection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('settings.display.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  // ROC calendar toggle
  const toggleRow = document.createElement('label');
  toggleRow.className = 'settings-toggle';

  const labelText = document.createElement('span');
  labelText.className = 'settings-toggle__label';
  labelText.textContent = t('settings.display.roc_calendar');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'settings-toggle__checkbox';
  checkbox.checked = localStorage.getItem('powerreader_roc_calendar') === '1';
  checkbox.addEventListener('change', () => {
    localStorage.setItem('powerreader_roc_calendar', checkbox.checked ? '1' : '0');
  });

  toggleRow.appendChild(labelText);
  toggleRow.appendChild(checkbox);
  card.appendChild(toggleRow);

  const hint = document.createElement('p');
  hint.className = 'settings-card__hint';
  hint.textContent = t('settings.display.roc_calendar_hint');
  card.appendChild(hint);

  section.appendChild(card);
  container.appendChild(section);
}

/**
 * Render notification toggle section.
 */
function renderNotificationSection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('settings.notifications.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  // Push notification toggle
  const toggleRow = document.createElement('label');
  toggleRow.className = 'settings-toggle';

  const labelText = document.createElement('span');
  labelText.className = 'settings-toggle__label';
  labelText.textContent = t('settings.notifications.push');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'settings-toggle__checkbox';
  checkbox.checked = Notification.permission === 'granted';
  checkbox.disabled = Notification.permission === 'denied';
  checkbox.addEventListener('change', async () => {
    if (checkbox.checked) {
      const perm = await Notification.requestPermission();
      checkbox.checked = perm === 'granted';
    }
    // Store preference
    localStorage.setItem('powerreader_push_enabled', checkbox.checked ? '1' : '0');
  });

  toggleRow.appendChild(labelText);
  toggleRow.appendChild(checkbox);
  card.appendChild(toggleRow);

  if (Notification.permission === 'denied') {
    const hint = document.createElement('p');
    hint.className = 'settings-card__hint';
    hint.textContent = t('settings.notifications.denied_hint');
    card.appendChild(hint);
  }

  // Daily digest toggle
  const digestRow = document.createElement('label');
  digestRow.className = 'settings-toggle';

  const digestLabel = document.createElement('span');
  digestLabel.className = 'settings-toggle__label';
  digestLabel.textContent = t('settings.notifications.daily_digest');

  const digestCheckbox = document.createElement('input');
  digestCheckbox.type = 'checkbox';
  digestCheckbox.className = 'settings-toggle__checkbox';
  digestCheckbox.checked = localStorage.getItem('powerreader_daily_digest') !== '0';
  digestCheckbox.addEventListener('change', () => {
    localStorage.setItem('powerreader_daily_digest', digestCheckbox.checked ? '1' : '0');
  });

  digestRow.appendChild(digestLabel);
  digestRow.appendChild(digestCheckbox);
  card.appendChild(digestRow);

  section.appendChild(card);
  container.appendChild(section);
}

/**
 * Render about / version section.
 */
function renderAboutSection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('settings.about.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  const items = [
    { label: t('settings.about.app_name'), value: 'PowerReader' },
    { label: t('common.label.version'), value: '1.0.0' },
    { label: t('settings.about.license'), value: 'AGPL-3.0' },
    { label: t('settings.about.locale'), value: 'zh-TW (繁體中文)' }
  ];

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'settings-about__row';

    const labelEl = document.createElement('span');
    labelEl.className = 'settings-about__label';
    labelEl.textContent = item.label;

    const valueEl = document.createElement('span');
    valueEl.className = 'settings-about__value';
    valueEl.textContent = item.value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    card.appendChild(row);
  }

  section.appendChild(card);
  container.appendChild(section);
}

