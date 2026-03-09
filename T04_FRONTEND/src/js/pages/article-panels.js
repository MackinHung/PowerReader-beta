/**
 * PowerReader - Article Detail Panels
 *
 * Knowledge panel (RAG transparency) and cross-media cluster panel,
 * loaded as supplementary non-blocking sections on the article detail page.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { fetchArticleKnowledge, fetchArticleCluster } from '../api.js';

/**
 * Get news source display name.
 */
const SOURCE_NAMES = {
  liberty_times: '自由時報', united_daily_news: '聯合報', cna: '中央社',
  pts: '公視新聞', storm_media: '風傳媒', the_reporter: '報導者',
  the_news_lens: '關鍵評論網', china_times: '中國時報',
  '自由時報': '自由時報', '聯合報': '聯合報', '中央社': '中央社',
  '三立新聞': '三立新聞', 'ETtoday新聞雲': 'ETtoday新聞雲',
  '東森新聞': '東森新聞', '新頭殼': '新頭殼', '公視新聞': '公視新聞'
};

function getSourceName(sourceKey) {
  return SOURCE_NAMES[sourceKey] || sourceKey;
}

/**
 * Get knowledge type display label.
 */
function getKnowledgeTypeLabel(type) {
  const labels = {
    politician: '政治人物',
    media: '媒體',
    topic: '議題',
    term: '名詞',
    event: '事件'
  };
  return labels[type] || type;
}

/**
 * Load and render knowledge entries panel.
 */
export async function loadKnowledgePanel(container, articleId) {
  const slot = container.querySelector('#knowledge-panel');
  if (!slot) return;

  const result = await fetchArticleKnowledge(articleId);
  if (!result.success || !result.data?.knowledge_entries?.length) return;

  // Filter same as prompt.js formatKnowledgeAsL2 — only show entries actually fed to AI
  const relevantEntries = result.data.knowledge_entries.filter(
    e => e.score == null || e.score > 0
  );
  if (relevantEntries.length === 0) return;

  const details = document.createElement('details');
  details.className = 'knowledge-panel';

  const summary = document.createElement('summary');
  summary.className = 'knowledge-panel__summary';
  summary.textContent = `知識參考 (${relevantEntries.length} 筆)`;
  details.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'knowledge-panel__list';

  for (const entry of relevantEntries) {
    const item = document.createElement('li');
    item.className = 'knowledge-panel__item';

    const typeBadge = document.createElement('span');
    typeBadge.className = `knowledge-badge knowledge-badge--${entry.type}`;
    typeBadge.textContent = getKnowledgeTypeLabel(entry.type);

    const titleEl = document.createElement('strong');
    titleEl.textContent = entry.title || '';

    const snippet = document.createElement('p');
    snippet.className = 'knowledge-panel__snippet';
    snippet.textContent = entry.snippet || '';

    const score = document.createElement('span');
    score.className = 'knowledge-panel__score';
    score.textContent = `${Math.round((entry.score || 0) * 100)}%`;

    item.appendChild(typeBadge);
    item.appendChild(titleEl);
    item.appendChild(snippet);
    item.appendChild(score);
    list.appendChild(item);
  }

  details.appendChild(list);
  slot.appendChild(details);
}

/**
 * Load and render cross-media cluster panel.
 */
export async function loadClusterPanel(container, articleId) {
  const slot = container.querySelector('#cluster-panel');
  if (!slot) return;

  const result = await fetchArticleCluster(articleId);
  if (!result.success || !result.data?.articles?.length) return;

  const heading = document.createElement('h3');
  heading.className = 'section-heading';
  heading.textContent = '跨媒體比較';
  slot.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'cluster-panel__desc';
  desc.textContent = `${result.data.articles.length} 家媒體報導同一事件`;
  slot.appendChild(desc);

  const list = document.createElement('div');
  list.className = 'cluster-panel__list';

  for (const clusterArticle of result.data.articles) {
    if (clusterArticle.article_id === articleId) continue;

    const item = document.createElement('div');
    item.className = 'cluster-panel__item';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      window.location.hash = `#/article/${clusterArticle.article_id}`;
    });

    const sourceName = document.createElement('span');
    sourceName.className = 'article-card__source';
    sourceName.textContent = getSourceName(clusterArticle.source);

    const titleEl = document.createElement('span');
    titleEl.className = 'cluster-panel__title';
    titleEl.textContent = clusterArticle.title || '';

    const biasLabel = document.createElement('span');
    biasLabel.className = `bias-indicator bias-indicator--${clusterArticle.bias_category || 'center'}`;
    biasLabel.textContent = clusterArticle.bias_score != null ? String(clusterArticle.bias_score) : '-';

    item.appendChild(sourceName);
    item.appendChild(titleEl);
    item.appendChild(biasLabel);
    list.appendChild(item);
  }

  slot.appendChild(list);
}
