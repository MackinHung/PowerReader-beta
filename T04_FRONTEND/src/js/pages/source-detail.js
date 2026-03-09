/**
 * PowerReader - Source Detail Page
 *
 * Shows detailed source transparency panel with tendency,
 * camp distribution, monthly trend, and recent articles.
 *
 * Routes: #/source/:source_key
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { fetchSource } from '../api.js';
import { createBiasBar } from '../components/bias-bar.js';
import { getUserErrorMessage } from '../utils/error.js';

// Camp colors (inlined from shared/enums.js)
const CAMP_COLORS = {
  green: '#2E7D32',
  white: '#757575',
  blue: '#1565C0'
};

const CAMP_LABELS = {
  green: '泛綠',
  white: '中立',
  blue: '泛藍'
};

const TENDENCY_CAMP_LABELS = {
  pan_green: '偏泛綠',
  pan_white: '中立',
  pan_blue: '偏泛藍'
};

const CONFIDENCE_LABELS = {
  high: '高信心度',
  mid: '中信心度',
  low: '低信心度'
};

// Source display names
const SOURCE_NAMES = {
  liberty_times: '自由時報', taiwan_apple_daily: '蘋果日報',
  china_times: '中國時報', united_daily_news: '聯合報',
  common_wealth: '天下雜誌', business_weekly: '商業週刊',
  the_news_lens: '關鍵評論網', the_reporter: '報導者',
  cna: '中央社', pts: '公視新聞',
  economic_daily_news: '經濟日報', commercial_times: '工商時報',
  inside: 'Inside', technews: '科技新報', ithome: 'iThome',
  rew_causas: '新新聞', storm_media: '風傳媒',
  '自由時報': '自由時報', '聯合報': '聯合報', '中央社': '中央社',
  '三立新聞': '三立新聞', 'ETtoday新聞雲': 'ETtoday新聞雲',
  '東森新聞': '東森新聞', '新頭殼': '新頭殼', '公視新聞': '公視新聞',
  '關鍵評論網': '關鍵評論網', '科技新報': '科技新報', '風傳媒': '風傳媒'
};

/**
 * Render source detail page.
 * @param {HTMLElement} container
 * @param {{ hash: string }} params - source key in params.hash
 */
export async function renderSourceDetail(container, params) {
  container.innerHTML = '';
  const sourceKey = params.hash;

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--text source-detail__back';
  backBtn.textContent = '返回';
  backBtn.addEventListener('click', () => { window.history.back(); });
  container.appendChild(backBtn);

  // Loading
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-state';
  loadingEl.setAttribute('role', 'status');
  loadingEl.textContent = '載入中...';
  container.appendChild(loadingEl);

  const result = await fetchSource(sourceKey);
  loadingEl.remove();

  if (!result.success) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-state';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = getUserErrorMessage(result.error);
    container.appendChild(errorEl);
    return;
  }

  const data = result.data;

  // Source name
  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = SOURCE_NAMES[data.source] || data.source;
  container.appendChild(heading);

  // Tendency summary card
  container.appendChild(renderTendencySummary(data.tendency));

  // Camp distribution
  if (data.camp_distribution) {
    container.appendChild(renderCampDistribution(data.camp_distribution));
  }

  // Monthly trend
  if (data.monthly_trend && data.monthly_trend.length > 0) {
    container.appendChild(renderMonthlyTrend(data.monthly_trend));
  }

  // Recent articles
  if (data.recent_articles && data.recent_articles.length > 0) {
    container.appendChild(renderRecentArticles(data.recent_articles));
  }
}

/**
 * Render tendency summary card.
 */
function renderTendencySummary(tendency) {
  const card = document.createElement('div');
  card.className = 'source-tendency-card';

  // Camp badge
  const campBadge = document.createElement('span');
  campBadge.className = `source-tendency__camp source-tendency__camp--${tendency.camp}`;
  campBadge.textContent = TENDENCY_CAMP_LABELS[tendency.camp] || tendency.camp;
  card.appendChild(campBadge);

  // Stats grid
  const grid = document.createElement('div');
  grid.className = 'source-tendency__stats';

  // Average score
  grid.appendChild(createStatItem(
    '平均分數',
    String(tendency.avg_bias_score)
  ));

  // Bias bar
  const barCell = document.createElement('div');
  barCell.className = 'source-tendency__stat-item source-tendency__stat-item--bar';
  barCell.appendChild(createBiasBar(tendency.avg_bias_score, ''));
  grid.appendChild(barCell);

  // Sample count
  grid.appendChild(createStatItem(
    '樣本數',
    String(tendency.sample_count)
  ));

  // Confidence
  grid.appendChild(createStatItem(
    CONFIDENCE_LABELS[tendency.confidence] || tendency.confidence,
    `近 ${tendency.window_days} 天`
  ));

  card.appendChild(grid);
  return card;
}

/**
 * Create a stat label-value item.
 */
function createStatItem(label, value) {
  const item = document.createElement('div');
  item.className = 'source-tendency__stat-item';

  const labelEl = document.createElement('span');
  labelEl.className = 'source-tendency__stat-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'source-tendency__stat-value';
  valueEl.textContent = value;

  item.appendChild(labelEl);
  item.appendChild(valueEl);
  return item;
}

/**
 * Render camp distribution section.
 */
function renderCampDistribution(dist) {
  const section = document.createElement('section');
  section.className = 'source-detail__section';

  const heading = document.createElement('h3');
  heading.textContent = '陣營分布';
  section.appendChild(heading);

  const total = (dist.green || 0) + (dist.white || 0) + (dist.blue || 0);
  if (total === 0) return section;

  const bar = document.createElement('div');
  bar.className = 'blindspot-dist__bar';

  for (const [camp, color] of Object.entries(CAMP_COLORS)) {
    const count = dist[camp] || 0;
    if (count === 0) continue;

    const pct = Math.round((count / total) * 100);
    const segment = document.createElement('div');
    segment.className = 'blindspot-dist__segment';
    segment.style.width = `${pct}%`;
    segment.style.backgroundColor = color;
    if (pct >= 12) {
      segment.textContent = `${pct}%`;
    }
    segment.setAttribute('title', `${CAMP_LABELS[camp] || camp}: ${count} (${pct}%)`);
    bar.appendChild(segment);
  }

  section.appendChild(bar);

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
    label.textContent = `${CAMP_LABELS[camp] || camp} ${count} (${Math.round((count / total) * 100)}%)`;

    item.appendChild(dot);
    item.appendChild(label);
    legend.appendChild(item);
  }

  section.appendChild(legend);
  return section;
}

/**
 * Render monthly trend as a simple horizontal bar chart.
 */
function renderMonthlyTrend(trend) {
  const section = document.createElement('section');
  section.className = 'source-detail__section';

  const heading = document.createElement('h3');
  heading.textContent = '月度趨勢';
  section.appendChild(heading);

  const chart = document.createElement('div');
  chart.className = 'source-trend';

  for (const item of trend) {
    const row = document.createElement('div');
    row.className = 'source-trend__row';

    const monthLabel = document.createElement('span');
    monthLabel.className = 'source-trend__month';
    monthLabel.textContent = item.month;

    const barWrap = document.createElement('div');
    barWrap.className = 'source-trend__bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'source-trend__bar';
    bar.style.width = `${Math.min(100, item.avg_bias)}%`;

    // Color based on avg bias
    if (item.avg_bias <= 40) bar.style.backgroundColor = CAMP_COLORS.green;
    else if (item.avg_bias >= 60) bar.style.backgroundColor = CAMP_COLORS.blue;
    else bar.style.backgroundColor = CAMP_COLORS.white;

    barWrap.appendChild(bar);

    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'source-trend__score';
    scoreLabel.textContent = `${Math.round(item.avg_bias)} (${item.count})`;

    row.appendChild(monthLabel);
    row.appendChild(barWrap);
    row.appendChild(scoreLabel);
    chart.appendChild(row);
  }

  section.appendChild(chart);
  return section;
}

/**
 * Render recent articles list.
 */
function renderRecentArticles(articles) {
  const section = document.createElement('section');
  section.className = 'source-detail__section';

  const heading = document.createElement('h3');
  heading.textContent = '近期文章';
  section.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'source-recent';

  for (const article of articles) {
    const li = document.createElement('li');
    li.className = 'source-recent__item';

    const link = document.createElement('a');
    link.className = 'source-recent__link';
    link.href = `#/article/${article.article_id}`;
    link.textContent = article.title || '';

    const score = document.createElement('span');
    score.className = 'source-recent__score';
    score.textContent = article.bias_score != null ? String(article.bias_score) : '-';

    li.appendChild(link);
    li.appendChild(score);
    list.appendChild(li);
  }

  section.appendChild(list);
  return section;
}
