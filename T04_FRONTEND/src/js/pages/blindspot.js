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

import { fetchBlindspotEvents, fetchArticle } from '../api.js';
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

const CAMP_LABELS = {
  green: '民進黨(綠)',
  white: '民眾黨(白)',
  blue: '國民黨(藍)'
};

const FILTER_LABELS = {
  all: '全部',
  green_only: '僅綠營報導',
  blue_only: '僅藍營報導',
  white_missing: '缺乏中立報導',
  imbalanced: '報導失衡'
};

const TYPE_LABELS = {
  green_only: '僅綠營報導',
  blue_only: '僅藍營報導',
  white_missing: '缺乏中立報導',
  imbalanced: '報導失衡'
};

const MISSING_CAMP_LABELS = {
  pan_green: '民進黨(綠)',
  pan_blue: '國民黨(藍)',
  pan_white: '民眾黨(白)'
};

// Source → camp mapping (mirrors cron-blindspot.js SOURCE_CAMP)
const SOURCE_CAMP = {
  '自由時報': 'green', '三立新聞': 'green', '新頭殼': 'green', '匯流新聞': 'green',
  '中央社': 'white', '公視新聞': 'white', '關鍵評論網': 'white', '台視新聞': 'white',
  '鏡週刊': 'white', 'iThome': 'white', '科技新報': 'white', '風傳媒': 'white',
  '聯合報': 'blue', 'ETtoday新聞雲': 'blue', '東森新聞': 'blue', '中視新聞': 'blue'
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
  title.textContent = '報導盲區';
  container.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'blindspot-page__desc';
  desc.textContent = '偵測只有單一陣營媒體報導的事件，揭示資訊盲區';
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
      ? (FILTER_LABELS[filterType] || filterType)
      : FILTER_LABELS.all;
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
  loadingEl.textContent = '載入中...';
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
    empty.textContent = '目前沒有偵測到報導盲區';
    listEl.appendChild(empty);
    return;
  }

  for (const event of events) {
    listEl.appendChild(renderBlindspotCard(event));
  }
}

/**
 * Render a single blindspot event card (expandable on click).
 */
function renderBlindspotCard(event) {
  const card = document.createElement('section');
  card.className = `blindspot-card ${TYPE_CLASSES[event.blindspot_type] || ''}`;
  card.style.cursor = 'pointer';

  // Header area (always visible)
  const header = document.createElement('div');
  header.className = 'blindspot-card__header';

  // Type badge
  const badge = document.createElement('span');
  badge.className = 'blindspot-card__badge';
  badge.textContent = TYPE_LABELS[event.blindspot_type] || event.blindspot_type;
  header.appendChild(badge);

  // Expand arrow
  const arrow = document.createElement('span');
  arrow.className = 'blindspot-card__arrow';
  arrow.textContent = '\u25BC';
  header.appendChild(arrow);

  card.appendChild(header);

  // Event title
  const heading = document.createElement('h3');
  heading.className = 'blindspot-card__title';
  heading.textContent = event.title || '';
  card.appendChild(heading);

  // Missing camp callout
  if (event.missing_camp) {
    const missing = document.createElement('p');
    missing.className = 'blindspot-card__missing';
    const campName = MISSING_CAMP_LABELS[event.missing_camp] || event.missing_camp;
    missing.textContent = `缺少${campName}觀點`;
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
  articleCount.textContent = `${event.article_count} 篇報導`;
  meta.appendChild(articleCount);

  const sourceCount = document.createElement('span');
  sourceCount.textContent = `${event.source_count} 家媒體`;
  meta.appendChild(sourceCount);

  if (event.detected_at) {
    const dateEl = document.createElement('span');
    dateEl.textContent = formatShortDate(event.detected_at);
    meta.appendChild(dateEl);
  }

  card.appendChild(meta);

  // Expandable article list (hidden by default)
  const articleList = document.createElement('div');
  articleList.className = 'blindspot-card__articles';
  articleList.hidden = true;
  card.appendChild(articleList);

  // Click to expand/collapse
  let loaded = false;
  card.addEventListener('click', async (e) => {
    // Don't collapse when clicking article links
    if (e.target.closest('a')) return;

    const isExpanded = !articleList.hidden;
    articleList.hidden = isExpanded;
    arrow.textContent = isExpanded ? '\u25BC' : '\u25B2';
    card.classList.toggle('blindspot-card--expanded', !isExpanded);

    if (!loaded && !isExpanded && event.article_ids?.length > 0) {
      loaded = true;
      articleList.innerHTML = '<p class="blindspot-card__loading">載入文章中...</p>';
      await loadClusterArticles(articleList, event.article_ids);
    }
  });

  return card;
}

/**
 * Load and render articles for a blindspot cluster.
 */
async function loadClusterArticles(container, articleIds) {
  container.innerHTML = '';

  const results = await Promise.all(
    articleIds.map(id => fetchArticle(id))
  );

  const list = document.createElement('ul');
  list.className = 'blindspot-articles';

  for (const result of results) {
    if (!result.success) continue;
    const article = result.data?.article || result.data;
    if (!article) continue;

    const li = document.createElement('li');
    li.className = 'blindspot-articles__item';

    // Camp dot
    const camp = SOURCE_CAMP[article.source];
    if (camp) {
      const dot = document.createElement('span');
      dot.className = 'blindspot-articles__camp-dot';
      dot.style.backgroundColor = CAMP_COLORS[camp];
      dot.setAttribute('title', CAMP_LABELS[camp] || camp);
      li.appendChild(dot);
    }

    // Source label
    const source = document.createElement('span');
    source.className = 'blindspot-articles__source';
    source.textContent = article.source || '';
    li.appendChild(source);

    // Title link → article detail page
    const link = document.createElement('a');
    link.className = 'blindspot-articles__link';
    link.href = `#/article/${article.article_id}`;
    link.textContent = article.title || '';
    li.appendChild(link);

    // Analysis status
    const status = document.createElement('span');
    status.className = 'blindspot-articles__status';
    status.textContent = article.analysis_count > 0 ? '已分析' : '未分析';
    status.classList.add(article.analysis_count > 0
      ? 'blindspot-articles__status--done'
      : 'blindspot-articles__status--pending');
    li.appendChild(status);

    list.appendChild(li);
  }

  if (list.children.length === 0) {
    container.innerHTML = '<p class="blindspot-card__empty">無法載入文章資料</p>';
    return;
  }

  container.appendChild(list);
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
    segment.setAttribute('title', `${CAMP_LABELS[camp] || camp}: ${count} (${pct}%)`);
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
    label.textContent = `${CAMP_LABELS[camp] || camp} ${count}`;

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
