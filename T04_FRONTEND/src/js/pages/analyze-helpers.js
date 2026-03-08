/**
 * PowerReader - Analysis UI Helpers
 *
 * Deadline indicator and error rendering for the analysis page.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';

// Analysis deadline: 72 hours from publish
const DEADLINE_HOURS = 72;

/**
 * Create a deadline indicator element showing time remaining.
 * @param {string} publishedAt - ISO date string
 * @returns {HTMLElement|null}
 */
export function createDeadlineIndicator(publishedAt) {
  const publishTime = new Date(publishedAt).getTime();
  const deadlineTime = publishTime + DEADLINE_HOURS * 60 * 60 * 1000;
  const remaining = deadlineTime - Date.now();

  if (remaining <= 0) {
    const el = document.createElement('span');
    el.className = 'deadline-indicator deadline-indicator--expired';
    el.textContent = t('article.deadline.expired');
    return el;
  }

  const remainingHours = Math.floor(remaining / (60 * 60 * 1000));
  const el = document.createElement('span');

  if (remainingHours <= 12) {
    el.className = 'deadline-indicator deadline-indicator--warning';
    el.textContent = t('article.deadline.warning', { hours: remainingHours });
  } else {
    el.className = 'deadline-indicator deadline-indicator--active';
    el.textContent = t('article.deadline.remaining', { hours: remainingHours });
  }

  return el;
}

/**
 * Render a generic error message in the analysis page.
 */
export function renderAnalyzeError(container, message) {
  const el = document.createElement('div');
  el.className = 'error-state';

  const text = document.createElement('p');
  text.textContent = message;
  el.appendChild(text);

  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn--primary';
  homeBtn.textContent = t('nav.button.home');
  homeBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  el.appendChild(homeBtn);

  container.appendChild(el);
}
