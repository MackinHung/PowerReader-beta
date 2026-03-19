<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import ControversyMeter from '$lib/components/data-viz/ControversyMeter.svelte';
  import ArticleCard from '$lib/components/article/ArticleCard.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';
  import * as api from '$lib/core/api.js';

  const media = getMediaQueryStore();
  let clusterId = $derived(page.params.id);

  let cluster = $state(null);
  let articles = $state([]);
  let loading = $state(true);
  let error = $state(null);

  const BLINDSPOT_LABELS = {
    green_only: '僅綠營報導',
    blue_only: '僅藍營報導',
    white_missing: '缺乏中立報導',
    imbalanced: '報導失衡'
  };

  const CONTROVERSY_COLORS = [
    { max: 20, color: '#4CAF50', label: '低' },
    { max: 40, color: '#8BC34A', label: '中低' },
    { max: 60, color: '#FFC107', label: '中' },
    { max: 80, color: '#FF9800', label: '中高' },
    { max: 100, color: '#F44336', label: '高' },
  ];

  let campDist = $derived(cluster?.camp_distribution || {});
  let hasAnalysis = $derived(
    (cluster?.analyzed_count ?? 0) > 0 ||
    (campDist.green ?? 0) + (campDist.white ?? 0) + (campDist.blue ?? 0) > 0
  );
  let blindspotLabel = $derived(
    cluster?.blindspot_type ? (BLINDSPOT_LABELS[cluster.blindspot_type] || cluster.blindspot_type) : null
  );
  let controversyConfig = $derived(() => {
    const s = cluster?.avg_controversy_score;
    if (s == null) return null;
    return CONTROVERSY_COLORS.find(c => s <= c.max) || CONTROVERSY_COLORS[4];
  });

  // Group articles by source for comparison table
  let articlesBySource = $derived(() => {
    const map = {};
    for (const art of articles) {
      if (!map[art.source]) map[art.source] = [];
      map[art.source].push(art);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  });

  $effect(() => {
    const id = clusterId;
    untrack(() => loadCluster(id));
  });

  async function loadCluster(id) {
    loading = true;
    error = null;
    cluster = null;
    articles = [];
    try {
      const result = await api.fetchClusterDetail(id);
      if (result.success) {
        cluster = result.data?.cluster;
        articles = result.data?.articles || [];
      } else {
        error = result.error?.message || '無法載入事件';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function handleArticleClick(article) {
    if (article.primary_url) {
      window.open(article.primary_url, '_blank', 'noopener');
    }
  }
</script>

<svelte:head>
  <title>{cluster?.representative_title ? `${cluster.representative_title} | PowerReader` : '事件詳情 | PowerReader'}</title>
  {#if cluster?.representative_title}
    <meta property="og:title" content="{cluster.representative_title} | PowerReader" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="https://powerreader.pages.dev/event/{clusterId}" />
    <meta name="twitter:title" content="{cluster.representative_title} | PowerReader" />
  {/if}
  {#if cluster?.article_count}
    <meta property="og:description" content="{cluster.representative_title} - {cluster.article_count} 篇報導 · {cluster.source_count} 家媒體 | PowerReader 台灣新聞立場分析" />
    <meta name="twitter:description" content="{cluster.representative_title} - {cluster.article_count} 篇報導 · {cluster.source_count} 家媒體" />
  {/if}
</svelte:head>

<div class="cluster-detail" class:desktop={media.isDesktop}>
  {#if loading}
    <div class="center-state">
      <ProgressIndicator type="circular" />
    </div>
  {:else if error}
    <div class="center-state">
      <span class="material-symbols-outlined error-icon">error</span>
      <p>{error}</p>
      <Button variant="outlined" onclick={() => loadCluster(clusterId)}>重試</Button>
    </div>
  {:else if cluster}
    <!-- Header (Light) -->
    <div class="detail-header">
      <div class="header-badges">
        {#if cluster.category}
          <span class="category-badge">{cluster.category}</span>
        {/if}
        {#if blindspotLabel}
          <span class="blindspot-badge">{blindspotLabel}</span>
        {/if}
        <span class="meta-badge">{cluster.article_count} 篇 · {cluster.source_count} 家媒體</span>
      </div>
      <h1 class="detail-title">{cluster.representative_title}</h1>
      <span class="detail-time">
        <span class="material-symbols-outlined time-icon">schedule</span>
        {formatDate(cluster.earliest_published_at)} — {formatDate(cluster.latest_published_at)}
      </span>
    </div>

    <!-- Analysis Zone (Dark) -->
    <div class="analysis-zone">
      <h3 class="zone-title">分析數據</h3>
      <div class="zone-content">
        <div class="zone-grid">
          <!-- Controversy -->
          {#if controversyConfig()}
            <div class="zone-item">
              <span class="zone-label">平均爭議程度</span>
              <div class="controversy-row">
                <div class="heat-bar-container">
                  <div
                    class="heat-bar"
                    style="width: {cluster.avg_controversy_score}%; background: {controversyConfig().color}"
                  ></div>
                </div>
                <span class="controversy-label" style="color: {controversyConfig().color}">
                  {controversyConfig().label} ({Math.round(cluster.avg_controversy_score)})
                </span>
              </div>
            </div>
          {/if}

          <!-- Camp Distribution (only when analysis data exists) -->
          {#if hasAnalysis}
            <div class="zone-item">
              <span class="zone-label">陣營比例</span>
              <CampBar
                green={campDist.green ?? 0}
                white={campDist.white ?? 0}
                blue={campDist.blue ?? 0}
                dark={true}
              />
            </div>
          {:else}
            <div class="zone-item">
              <span class="zone-label">陣營比例</span>
              <span class="zone-pending">尚無分析資料</span>
            </div>
          {/if}
        </div>

        <!-- Blindspot Alert (only when analysis data exists) -->
        {#if hasAnalysis && cluster.is_blindspot && blindspotLabel}
          <div class="zone-blindspot">
            <span class="material-symbols-outlined">warning</span>
            <div>
              <strong>{blindspotLabel}</strong>
              {#if cluster.missing_camp}
                <p class="alert-desc">此事件缺少{cluster.missing_camp === 'pan_green' ? '泛綠' : cluster.missing_camp === 'pan_blue' ? '泛藍' : '中立'}觀點的報導</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Cross-media Comparison (Light) -->
    {#if articlesBySource().length >= 2}
      <div class="comparison-section">
        <h2 class="section-heading">
          <span class="material-symbols-outlined">compare_arrows</span>
          跨媒體比較
        </h2>
        <div class="comparison-table">
          <div class="comparison-header-row">
            <span class="col-source">來源</span>
            <span class="col-title">標題</span>
            <span class="col-bias">偏向</span>
          </div>
          {#each articlesBySource() as [source, sourceArticles], rowIdx}
            <div class="comparison-row" class:odd={rowIdx % 2 === 1}>
              <div class="comparison-source">
                <span class="source-name">{source}</span>
                <span class="source-count">{sourceArticles.length} 篇</span>
              </div>
              <div class="comparison-articles">
                {#each sourceArticles as art}
                  <div class="comparison-article">
                    <span class="art-title">{art.title}</span>
                    {#if art.bias_score != null}
                      <span class="art-bias" class:green={art.bias_score <= 40} class:blue={art.bias_score >= 60}>
                        {art.bias_score}
                      </span>
                    {:else}
                      <span class="art-bias pending">待分析</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Related Articles (Light) -->
    <div class="articles-section">
      <h2 class="section-heading">
        <span class="material-symbols-outlined">article</span>
        相關報導 ({articles.length})
      </h2>
      <div class="articles-list">
        {#each articles as article, i (article.article_id ?? i)}
          <ArticleCard
            {article}
            onclick={() => handleArticleClick(article)}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .cluster-detail {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 16px;
    gap: 16px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .error-icon {
    font-size: 48px;
    color: var(--md-sys-color-error);
  }
  .center-state p {
    margin: 0;
    font: var(--md-sys-typescale-body-large-font);
  }

  /* === Header (Light) === */
  .detail-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .header-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .category-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-primary-container);
    background: var(--md-sys-color-primary-container);
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .blindspot-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-error);
    background: var(--md-sys-color-error-container);
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .meta-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .detail-title {
    margin: 0;
    font: 700 28px/36px var(--pr-font-serif);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
  }
  .detail-time {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .time-icon {
    font-size: 16px;
  }

  /* === Analysis Zone (Dark) === */
  .analysis-zone {
    background: var(--pr-analysis-surface);
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 24px;
    border: 1px solid var(--pr-analysis-border);
  }
  .zone-title {
    font: 700 18px/24px var(--pr-font-serif);
    color: var(--pr-analysis-gold);
    margin: 0 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--pr-analysis-border);
  }
  .zone-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .zone-grid {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  @media (min-width: 768px) {
    .zone-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
  }
  .zone-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zone-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--pr-analysis-on-surface-variant);
  }
  .controversy-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .heat-bar-container {
    flex: 1;
    height: 8px;
    background: var(--pr-analysis-border);
    border-radius: var(--md-sys-shape-corner-full);
    overflow: hidden;
  }
  .heat-bar {
    height: 100%;
    border-radius: var(--md-sys-shape-corner-full);
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }
  .controversy-label {
    font: var(--md-sys-typescale-label-medium-font);
    white-space: nowrap;
  }
  .zone-blindspot {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(179, 38, 30, 0.15);
    border-radius: var(--md-sys-shape-corner-small);
    color: #F9DEDC;
    border: 1px solid rgba(179, 38, 30, 0.3);
  }
  .zone-blindspot .material-symbols-outlined {
    flex-shrink: 0;
    font-size: 24px;
    color: #F44336;
  }
  .zone-blindspot strong {
    font: var(--md-sys-typescale-title-small-font);
    color: #F9DEDC;
  }
  .alert-desc {
    margin: 4px 0 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--pr-analysis-on-surface-variant);
  }

  /* === Section Heading === */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding-left: 12px;
    border-left: 4px solid var(--pr-gold);
    font: 500 16px/24px var(--pr-font-serif);
    color: var(--md-sys-color-on-surface);
  }
  .section-heading .material-symbols-outlined {
    font-size: 20px;
    color: var(--pr-gold);
  }

  /* === Comparison Table (Light, with zebra stripes) === */
  .comparison-section, .articles-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .comparison-table {
    display: flex;
    flex-direction: column;
    border-radius: var(--md-sys-shape-corner-medium);
    overflow: hidden;
    border: 1px solid var(--md-sys-color-outline-variant);
  }
  .comparison-header-row {
    display: none;
    padding: 8px 12px;
    background: var(--md-sys-color-surface-container);
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    font-weight: 600;
    gap: 8px;
  }
  @media (min-width: 768px) {
    .comparison-header-row {
      display: flex;
    }
    .col-source { width: 120px; flex-shrink: 0; }
    .col-title { flex: 1; }
    .col-bias { width: 60px; text-align: right; flex-shrink: 0; }
  }
  .comparison-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--md-sys-color-surface-container-lowest);
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
  .comparison-row:first-of-type {
    border-top: none;
  }
  .comparison-row.odd {
    background: var(--md-sys-color-surface-container-low);
  }
  .comparison-source {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .source-name {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 600;
  }
  .source-count {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .comparison-articles {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 8px;
  }
  .comparison-article {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .art-title {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex: 1;
  }
  .art-bias {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-surface-container);
  }
  .art-bias.green { color: var(--camp-green); background: rgba(46, 125, 50, 0.08); }
  .art-bias.blue { color: var(--camp-blue); background: rgba(21, 101, 192, 0.08); }
  .art-bias.pending {
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container-high);
    opacity: 0.7;
  }
  .zone-pending {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--pr-analysis-on-surface-variant);
    opacity: 0.6;
    font-style: italic;
  }

  /* === Articles List === */
  .articles-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  @media (min-width: 768px) {
    .detail-title {
      font-size: 32px;
      line-height: 40px;
    }
  }
</style>
