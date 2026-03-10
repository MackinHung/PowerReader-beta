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
import { detectBestMode, getModeLabel, clearAllModelCaches } from '../model/inference.js';
import { scanGPU, getUserGPUSelection, saveUserGPUSelection } from '../model/benchmark.js';
import { getGPUOptionsForArch } from '../model/gpu-database.js';
import {
  startAutoRunner, stopAutoRunner, getAutoRunnerStatus,
  onAutoRunnerUpdate, isAutoModeEnabled, setAnalysisMode,
  pauseAutoRunner, resumeAutoRunner, forceStopAutoRunner
} from '../model/auto-runner.js';
import { isAuthenticated } from '../auth.js';
import { formatVRAM, createInfoRow } from './settings-helpers.js';
import { isMobileDevice, getBrowserInfo } from '../utils/device-detect.js';

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

  // Analysis mode section (auto/manual toggle + controls)
  renderAnalysisModeSection(container);

  // Hardware detection section
  await renderHardwareSection(container);

  // Cache management section
  await renderCacheSection(container);

  // Display settings (ROC calendar)
  renderDisplaySection(container);

  // Notification toggle
  renderNotificationSection(container);

  // About section
  renderAboutSection(container);
}

let _analysisModeObserver = null;
let _analysisModeUnsub = null;

/**
 * Render analysis mode section: auto/manual toggle, start/stop, stats.
 */
function renderAnalysisModeSection(container) {
  // Clean up previous instance
  if (_analysisModeUnsub) { _analysisModeUnsub(); _analysisModeUnsub = null; }
  if (_analysisModeObserver) { _analysisModeObserver.disconnect(); _analysisModeObserver = null; }
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('settings.analysis_mode.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  // Mode toggle (auto / manual)
  const toggleRow = document.createElement('div');
  toggleRow.className = 'auto-runner-settings__mode-toggle';

  const autoBtn = document.createElement('button');
  autoBtn.className = 'auto-runner-settings__mode-btn';
  autoBtn.textContent = t('auto_runner.mode.auto');

  const manualBtn = document.createElement('button');
  manualBtn.className = 'auto-runner-settings__mode-btn';
  manualBtn.textContent = t('auto_runner.mode.manual');

  function updateToggleUI(isAuto) {
    if (isAuto) {
      autoBtn.classList.add('auto-runner-settings__mode-btn--active');
      manualBtn.classList.remove('auto-runner-settings__mode-btn--active');
    } else {
      manualBtn.classList.add('auto-runner-settings__mode-btn--active');
      autoBtn.classList.remove('auto-runner-settings__mode-btn--active');
    }
  }

  const mobileBlocked = isMobileDevice();
  updateToggleUI(isAutoModeEnabled());

  if (mobileBlocked) {
    autoBtn.disabled = true;
    autoBtn.title = t('auto_runner.error.mobile_blocked');
  }

  autoBtn.addEventListener('click', () => {
    if (mobileBlocked) return;
    setAnalysisMode('auto');
    updateToggleUI(true);
  });

  manualBtn.addEventListener('click', () => {
    setAnalysisMode('manual');
    updateToggleUI(false);
  });

  toggleRow.appendChild(autoBtn);
  toggleRow.appendChild(manualBtn);
  card.appendChild(toggleRow);

  // Mobile hint below toggle
  if (mobileBlocked) {
    const mobileHint = document.createElement('p');
    mobileHint.className = 'settings-card__hint';
    mobileHint.style.color = 'var(--color-bias-extreme)';
    mobileHint.textContent = t('auto_runner.error.mobile_blocked');
    card.appendChild(mobileHint);
  }

  // Stats grid (live-updated)
  const statsGrid = document.createElement('div');
  statsGrid.className = 'auto-runner-settings__stats';
  card.appendChild(statsGrid);

  // Status text
  const statusEl = document.createElement('p');
  statusEl.className = 'settings-card__subtitle';
  card.appendChild(statusEl);

  // Action button
  const actionBtn = document.createElement('button');
  actionBtn.className = 'btn btn--primary';
  card.appendChild(actionBtn);

  function renderRunnerState(status) {
    // Stats grid
    statsGrid.innerHTML = '';
    const statItems = [
      { value: status.analyzed, label: t('auto_runner.progress.analyzed'), cls: 'auto-runner-settings__stat--success' },
      { value: status.skipped, label: t('auto_runner.progress.skipped'), cls: 'auto-runner-settings__stat--skip' },
      { value: status.failed, label: t('auto_runner.progress.failed'), cls: 'auto-runner-settings__stat--fail' }
    ];

    for (const item of statItems) {
      const stat = document.createElement('div');
      stat.className = `auto-runner-settings__stat ${item.cls}`;
      const val = document.createElement('span');
      val.className = 'auto-runner-settings__stat-value';
      val.textContent = String(item.value);
      const lbl = document.createElement('span');
      lbl.className = 'auto-runner-settings__stat-label';
      lbl.textContent = item.label;
      stat.appendChild(val);
      stat.appendChild(lbl);
      statsGrid.appendChild(stat);
    }

    // Status + button(s)
    // Remove any extra buttons from previous render
    const existingExtra = card.querySelector('.settings-analysis-extra-btn');
    if (existingExtra) existingExtra.remove();

    if (status.running) {
      const title = status.currentArticle?.title || '';
      statusEl.textContent = status.paused
        ? t('auto_runner.paused')
        : title.length > 40 ? title.slice(0, 40) + '…' : title;

      if (status.paused) {
        // Paused: show "繼續" + "強制停止"
        actionBtn.textContent = t('auto_runner.resume');
        actionBtn.className = 'btn btn--primary';
        actionBtn.onclick = () => resumeAutoRunner();

        const forceBtn = document.createElement('button');
        forceBtn.className = 'btn btn--secondary settings-analysis-extra-btn';
        forceBtn.textContent = t('auto_runner.force_stop');
        forceBtn.onclick = () => forceStopAutoRunner();
        card.appendChild(forceBtn);
      } else {
        // Running: show "暫停"
        actionBtn.textContent = t('auto_runner.pause');
        actionBtn.className = 'btn btn--secondary';
        actionBtn.onclick = () => pauseAutoRunner();
      }
    } else {
      if (status.stopReason) {
        statusEl.textContent = status.stopReason;
      } else if (status.analyzed > 0 || status.skipped > 0 || status.failed > 0) {
        statusEl.textContent = t('auto_runner.last_run', {
          analyzed: String(status.analyzed),
          skipped: String(status.skipped),
          failed: String(status.failed)
        });
      } else {
        statusEl.textContent = t('auto_runner.status.idle');
      }

      actionBtn.textContent = t('auto_runner.start');
      actionBtn.className = 'btn btn--primary';
      actionBtn.disabled = !isAuthenticated();
      actionBtn.onclick = () => startAutoRunner();
    }
  }

  // Initial render
  renderRunnerState(getAutoRunnerStatus());

  // Live updates
  _analysisModeUnsub = onAutoRunnerUpdate(renderRunnerState);

  // Clean up subscription when section is removed from DOM
  _analysisModeObserver = new MutationObserver(() => {
    if (!document.contains(section)) {
      if (_analysisModeUnsub) { _analysisModeUnsub(); _analysisModeUnsub = null; }
      if (_analysisModeObserver) { _analysisModeObserver.disconnect(); _analysisModeObserver = null; }
    }
  });
  _analysisModeObserver.observe(document.body, { childList: true, subtree: true });

  section.appendChild(card);
  container.appendChild(section);
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

  // Clear all WebLLM model caches (old + current)
  const clearCacheBtn = document.createElement('button');
  clearCacheBtn.className = 'btn btn--secondary';
  clearCacheBtn.textContent = t('model.cache.clear_all');
  clearCacheBtn.addEventListener('click', async () => {
    if (!window.confirm(t('model.cache.clear_confirm'))) return;
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = t('common.label.loading');
    const freedMB = await clearAllModelCaches();
    await deleteModel();
    localStorage.removeItem('powerreader_webllm_cached');
    clearCacheBtn.textContent = t('model.cache.cleared', { mb: String(freedMB) });
    setTimeout(() => renderSettings(container), 1500);
  });
  actionsRow.appendChild(clearCacheBtn);

  card.appendChild(actionsRow);
  section.appendChild(card);
  container.appendChild(section);
}

/**
 * Render hardware detection section.
 * @param {HTMLElement} container
 */
async function renderHardwareSection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = t('settings.hw.title');
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';

  // --- GPU Info ---
  const gpuTitle = document.createElement('p');
  gpuTitle.className = 'settings-card__title';
  gpuTitle.textContent = t('settings.hw.gpu_info');
  card.appendChild(gpuTitle);

  const gpuInfo = await scanGPU();
  const userOverride = getUserGPUSelection();

  const supportedColor = gpuInfo.supported
    ? 'var(--color-controversy-low)'
    : 'var(--color-bias-extreme)';
  const supportedText = gpuInfo.supported
    ? t('settings.hw.webgpu_yes')
    : t('settings.hw.webgpu_no');

  // Device type detection
  const mobile = isMobileDevice();
  const deviceTypeText = mobile ? t('device.type.mobile') : t('device.type.desktop');
  const deviceTypeColor = mobile ? 'var(--color-bias-extreme)' : 'var(--color-controversy-low)';
  card.appendChild(createInfoRow(t('settings.hw.device_type'), deviceTypeText, deviceTypeColor));

  card.appendChild(createInfoRow(t('settings.hw.webgpu_supported'), supportedText, supportedColor));

  // Browser info
  const browserInfo = getBrowserInfo();
  if (browserInfo.name !== 'Unknown') {
    card.appendChild(createInfoRow(
      t('settings.hw.browser'),
      `${browserInfo.name} ${browserInfo.version}`
    ));
  } else {
    const browserUnknownRow = createInfoRow(
      t('settings.hw.browser'),
      t('settings.hw.browser_unknown'),
      'var(--color-text-secondary)'
    );
    card.appendChild(browserUnknownRow);
    const privacyHint = document.createElement('p');
    privacyHint.className = 'settings-card__hint';
    privacyHint.textContent = t('settings.hw.browser_privacy_hint');
    card.appendChild(privacyHint);
  }

  // Mobile warning or desktop browser hint
  if (mobile) {
    const warningEl = document.createElement('p');
    warningEl.className = 'settings-card__hint';
    warningEl.style.color = 'var(--color-bias-extreme)';
    warningEl.textContent = t('device.mobile_warning');
    card.appendChild(warningEl);
  } else if (!gpuInfo.supported) {
    const browserInfo = getBrowserInfo();
    if (browserInfo.message) {
      const hintEl = document.createElement('p');
      hintEl.className = 'settings-card__hint';
      hintEl.textContent = t(browserInfo.message);
      card.appendChild(hintEl);
    }
  }

  card.appendChild(createInfoRow(t('settings.hw.gpu_vendor'), gpuInfo.vendor || '—'));
  card.appendChild(createInfoRow(t('settings.hw.gpu_arch'), gpuInfo.architecture || '—'));

  // GPU device + VRAM — priority: user override > exact lookup > arch fallback
  if (userOverride) {
    // User previously selected their GPU from the picker
    card.appendChild(createInfoRow(t('settings.hw.gpu_device'), userOverride.device));
    const vramText = formatVRAM(userOverride.vramMB) + ' ' + t('settings.hw.vram_confirmed');
    card.appendChild(createInfoRow(t('settings.hw.vram'), vramText));
  } else if (gpuInfo.device && gpuInfo.vramMB > 0) {
    // Browser provided device name and exact VRAM lookup matched
    card.appendChild(createInfoRow(t('settings.hw.gpu_device'), gpuInfo.device));
    const vramText = formatVRAM(gpuInfo.vramMB) + ' ' + t('settings.hw.vram_ref');
    card.appendChild(createInfoRow(t('settings.hw.vram'), vramText));
  } else if (gpuInfo.gpuType === 'integrated' || gpuInfo.gpuType === 'unified') {
    card.appendChild(createInfoRow(t('settings.hw.gpu_device'), gpuInfo.device || '—'));
    card.appendChild(createInfoRow(t('settings.hw.vram'), t('settings.hw.vram_shared')));
  } else if (gpuInfo.archInfo) {
    // Device name hidden by browser, show arch + range
    const archLabel = gpuInfo.archInfo.label + ' (' + gpuInfo.archInfo.series + ')';
    card.appendChild(createInfoRow(t('settings.hw.gpu_device'), archLabel));
    const rangeText = gpuInfo.archInfo.vramRange + ' ' + t('settings.hw.vram_by_model');
    card.appendChild(createInfoRow(t('settings.hw.vram'), rangeText));
  } else {
    card.appendChild(createInfoRow(t('settings.hw.gpu_device'), gpuInfo.device || '—'));
    card.appendChild(createInfoRow(t('settings.hw.vram'), t('settings.hw.vram_unknown')));
  }

  // GPU picker — show when device is unknown and architecture options exist
  const needsPicker = !userOverride && !gpuInfo.device && gpuInfo.archInfo;
  if (needsPicker || userOverride) {
    renderGPUPicker(card, gpuInfo, container);
  }

  section.appendChild(card);
  container.appendChild(section);
}

/**
 * Render inline GPU picker for users whose device name is hidden by browser.
 * Shows a help hint + dropdown filtered to the detected architecture.
 */
function renderGPUPicker(card, gpuInfo, container) {
  const userOverride = getUserGPUSelection();
  const options = getGPUOptionsForArch(gpuInfo.architecture);

  const wrapper = document.createElement('div');
  wrapper.className = 'settings-gpu-picker';

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn btn--secondary btn--small';
  toggleBtn.textContent = userOverride
    ? t('settings.hw.gpu_picker_change')
    : t('settings.hw.gpu_picker_btn');
  wrapper.appendChild(toggleBtn);

  // Expandable picker area (hidden initially)
  const pickerArea = document.createElement('div');
  pickerArea.className = 'settings-gpu-picker__panel u-hidden';

  // Help hint
  const hint = document.createElement('p');
  hint.className = 'settings-card__hint';
  hint.textContent = t('settings.hw.gpu_picker_hint');
  pickerArea.appendChild(hint);

  // Dropdown
  if (options && options.length > 0) {
    const select = document.createElement('select');
    select.className = 'settings-gpu-picker__select';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('settings.hw.gpu_picker_placeholder');
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    for (const gpu of options) {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ device: gpu.name, vramMB: gpu.vramMB });
      opt.textContent = gpu.name + ' (' + formatVRAM(gpu.vramMB) + ')';
      select.appendChild(opt);
    }
    pickerArea.appendChild(select);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn--primary btn--small';
    saveBtn.textContent = t('settings.hw.gpu_picker_save');
    saveBtn.disabled = true;
    saveBtn.addEventListener('click', () => {
      const chosen = JSON.parse(select.value);
      saveUserGPUSelection(chosen.device, chosen.vramMB);
      renderSettings(container);
    });
    select.addEventListener('change', () => {
      saveBtn.disabled = !select.value;
    });
    pickerArea.appendChild(saveBtn);
  } else {
    const noOptions = document.createElement('p');
    noOptions.className = 'settings-card__hint';
    noOptions.textContent = t('settings.hw.gpu_picker_no_options');
    pickerArea.appendChild(noOptions);
  }

  toggleBtn.addEventListener('click', () => {
    pickerArea.classList.toggle('u-hidden');
  });

  wrapper.appendChild(pickerArea);
  card.appendChild(wrapper);
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
    renderSettings(container);
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

