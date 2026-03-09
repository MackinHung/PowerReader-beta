/**
 * PowerReader - Auto Runner Floating Status Bar
 *
 * Fixed-bottom overlay showing auto-analysis progress.
 * Visible when auto-runner is active, hides when stopped.
 * Click navigates to settings page.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { onAutoRunnerUpdate, stopAutoRunner } from '../model/auto-runner.js';

let _container = null;
let _unsubscribe = null;

/**
 * Mount the floating status bar to document.body.
 * Safe to call multiple times (no-op if already mounted).
 */
export function mountAutoRunnerStatus() {
  if (_container) return;

  _container = document.createElement('div');
  _container.className = 'auto-runner-float';
  _container.setAttribute('role', 'status');
  _container.setAttribute('aria-live', 'polite');
  _container.hidden = true;
  document.body.appendChild(_container);

  _unsubscribe = onAutoRunnerUpdate(_render);
}

/**
 * Unmount and clean up.
 */
export function unmountAutoRunnerStatus() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_container) {
    _container.remove();
    _container = null;
  }
}

// ── Internal: Render ──

function _render(status) {
  if (!_container) return;

  // Hide when not running
  if (!status.running) {
    _container.hidden = true;
    return;
  }

  _container.hidden = false;
  _container.innerHTML = '';

  // Clickable area → navigate to settings
  const infoArea = document.createElement('div');
  infoArea.className = 'auto-runner-float__info';
  infoArea.addEventListener('click', () => {
    window.location.hash = '#/settings';
  });

  // Pulsing dot
  const dot = document.createElement('span');
  dot.className = status.stopping
    ? 'auto-runner-float__dot auto-runner-float__dot--pausing'
    : 'auto-runner-float__dot auto-runner-float__dot--active';
  infoArea.appendChild(dot);

  // Article title (truncate to 25 chars)
  const titleEl = document.createElement('span');
  titleEl.className = 'auto-runner-float__title';
  if (status.currentArticle) {
    const title = status.currentArticle.title || '';
    titleEl.textContent = title.length > 25 ? title.slice(0, 25) + '…' : title;
  } else {
    titleEl.textContent = status.stopping
      ? t('auto_runner.stopping')
      : t('auto_runner.status.running');
  }
  infoArea.appendChild(titleEl);

  _container.appendChild(infoArea);

  // Counters
  const counters = document.createElement('div');
  counters.className = 'auto-runner-float__counters';

  const analyzedBadge = _createBadge(
    String(status.analyzed),
    t('auto_runner.progress.analyzed'),
    'auto-runner-float__badge--success'
  );
  counters.appendChild(analyzedBadge);

  if (status.skipped > 0) {
    const skippedBadge = _createBadge(
      String(status.skipped),
      t('auto_runner.progress.skipped'),
      'auto-runner-float__badge--skip'
    );
    counters.appendChild(skippedBadge);
  }

  if (status.failed > 0) {
    const failedBadge = _createBadge(
      String(status.failed),
      t('auto_runner.progress.failed'),
      'auto-runner-float__badge--fail'
    );
    counters.appendChild(failedBadge);
  }

  _container.appendChild(counters);

  // Stop button
  const stopBtn = document.createElement('button');
  stopBtn.className = 'auto-runner-float__stop';
  stopBtn.textContent = status.stopping
    ? t('auto_runner.stopping')
    : t('auto_runner.stop');
  stopBtn.disabled = status.stopping;
  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopAutoRunner();
  });
  _container.appendChild(stopBtn);
}

function _createBadge(count, label, className) {
  const badge = document.createElement('span');
  badge.className = `auto-runner-float__badge ${className}`;
  badge.textContent = `${count} ${label}`;
  return badge;
}
