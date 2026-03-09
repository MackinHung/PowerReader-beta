/**
 * PowerReader - Blindspot Page
 *
 * Shows events where one or more camps have no/insufficient coverage.
 * Data populated by cron worker (hourly cluster scan).
 *
 * Routes: #/blindspot
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import { fetchBlindspotEvents } from '../api.js';
import { getUserErrorMessage } from '../utils/error.js';

// Blindspot type → CSS modifier class
const TYPE_CLASSES = {
  green_only: 'blindspot-card--green',
  blue_only: 'blindspot-card--blue',
  white_missing: 'blindspot-card--white',
  imbalanced: 'blindspot-card--imbalanced'
};

// Camp colors (inlined from shared/enums.js CAMP_COLORS)
const CAMP_COLORS = {
  green: '#2E7D32',
  white: '#757575',
  blue: '#1565C0'
};

const FILTER_TYPES = [null, 'green_only', 'blue_only', 'white_missing', 'imbalanced'];

/**
 * Render blindspot page.
 * @param {HTMLElement} container
 */
export async function renderBlindspot(container) {
  container.innerHTML = '';

  // Title
  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = t('nav.title.blindspot');
  container.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'blindspot-page__desc';
  desc.textContent = t('blindspot.desc');
  container.appendChild(desc);

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'blindspot-filter';
  filterBar.setAttribute('role', 'toolbar');
  filterBar.setAttribute('aria-label', 'Filter blindspot events');

  let activeFilter = null;

  for (const filterType of FILTER_TYPES) {
    const btn = document.createElement('button');
    btn.className = 'blindspot-filter__btn';
    if (filterType === null) btn.classList.add('blindspot-filter__btn--active');
    btn.textContent = filterType
      ? t(`blindspot.filter.${filterType}`)
      : t('blindspot.filter.all');
    btn.setAttribute('data-filter', filterType || 'all');

    btn.addEventListener('click', () => {
      activeFilter = filterType;
      // Update active state
      for (const b of filterBar.querySelectorAll('.blindspot-filter__btn')) {
        b.classList.remove('blindspot-filter__btn--active');
      }
      btn.classList.add('blindspot-filter__btn--active');
      loadEvents(list, activeFilter);
    });

    filterBar.appendChild(btn);
  }

  container.appendChild(filterBar);

  // Events list container
  const list = document.createElement('div');
  list.className = 'blindspot-list';
  container.appendChild(list);

  // Initial load
  await loadEvents(list, activeFilter);
}

/**
 * Load and render blindspot events.
 */
async function loadEvents(listEl, typeFilter) {
  listEl.innerHTML = '';

  // Loading
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.setAttribute('role', 'status');
  loadingEl.textContent = t('common.label.loading');
  listEl.appendChild(loadingEl);

  const opts = { page: 1, limit: 50 };
  if (typeFilter) opts.type = typeFilter;

  const result = await fetchBlindspotEvents(opts);
  loadingEl.remove();

  if (!result.success) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-state';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = getUserErrorMessage(result.error);
    listEl.appendChild(errorEl);
    return;
  }

  const events = result.data?.blindspot_events || [];

  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('blindspot.empty');
    listEl.appendChild(empty);
    return;
  }

  for (const event of events) {
    listEl.appendChild(renderBlindspotCard(event));
  }
}

/**
 * Render a single blindspot event card.
 */
function renderBlindspotCard(event) {
  const card = document.createElement('section');
  card.className = `blindspot-card ${TYPE_CLASSES[event.blindspot_type] || ''}`;

  // Type badge
  const badge = document.createElement('span');
  badge.className = 'blindspot-card__badge';
  badge.textContent = t(`blindspot.type.${event.blindspot_type}`);
  card.appendChild(badge);

  // Event title
  const heading = document.createElement('h3');
  heading.className = 'blindspot-card__title';
  heading.textContent = event.title || '';
  card.appendChild(heading);

  // Missing camp callout
  if (event.missing_camp) {
    const missing = document.createElement('p');
    missing.className = 'blindspot-card__missing';
    missing.textContent = t('blindspot.missing_camp', {
      camp: t(`blindspot.camp.${event.missing_camp}`)
    });
    card.appendChild(missing);
  }

  // Camp distribution bar
  const dist = event.camp_distribution;
  if (dist) {
    const total = (dist.green || 0) + (dist.white || 0) + (dist.blue || 0);
    if (total > 0) {
      card.appendChild(renderDistributionBar(dist, total));
    }
  }

  // Metadata row
  const meta = document.createElement('div');
  meta.className = 'blindspot-card__meta';

  const articleCount = document.createElement('span');
  articleCount.textContent = t('blindspot.article_count', { count: event.article_count });
  meta.appendChild(articleCount);

  const sourceCount = document.createElement('span');
  sourceCount.textContent = t('blindspot.source_count', { count: event.source_count });
  meta.appendChild(sourceCount);

  if (event.detected_at) {
    const dateEl = document.createElement('span');
    dateEl.textContent = formatShortDate(event.detected_at);
    meta.appendChild(dateEl);
  }

  card.appendChild(meta);

  return card;
}

/**
 * Render camp distribution horizontal bar.
 */
function renderDistributionBar(dist, total) {
  const wrapper = document.createElement('div');
  wrapper.className = 'blindspot-dist';

  const bar = document.createElement('div');
  bar.className = 'blindspot-dist__bar';
  bar.setAttribute('role', 'img');

  for (const [camp, color] of Object.entries(CAMP_COLORS)) {
    const count = dist[camp] || 0;
    if (count === 0) continue;

    const pct = Math.round((count / total) * 100);
    const segment = document.createElement('div');
    segment.className = 'blindspot-dist__segment';
    segment.style.width = `${pct}%`;
    segment.style.backgroundColor = color;
    if (pct >= 15) {
      segment.textContent = `${count}`;
    }
    segment.setAttribute('title', `${t(`camp.label.${camp}`)}: ${count} (${pct}%)`);
    bar.appendChild(segment);
  }

  wrapper.appendChild(bar);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'blindspot-dist__legend';

  for (const [camp, color] of Object.entries(CAMP_COLORS)) {
    const count = dist[camp] || 0;
    if (count === 0) continue;

    const item = document.createElement('span');
    item.className = 'blindspot-dist__legend-item';

    const dot = document.createElement('span');
    dot.className = 'blindspot-dist__dot';
    dot.style.backgroundColor = color;

    const label = document.createElement('span');
    label.textContent = `${t(`camp.label.${camp}`)} ${count}`;

    item.appendChild(dot);
    item.appendChild(label);
    legend.appendChild(item);
  }

  wrapper.appendChild(legend);
  return wrapper;
}

/**
 * Format ISO date to short locale string.
 */
function formatShortDate(isoStr) {
  try {
    const d = new Date(isoStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}
