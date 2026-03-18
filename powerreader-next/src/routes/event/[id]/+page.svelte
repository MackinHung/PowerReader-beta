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
    <!-- Header -->
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

    <!-- Camp Distribution -->
    <Card variant="filled">
      <div class="viz-section">
        <span class="section-label">陣營比例</span>
        <CampBar
          green={campDist.green ?? 0}
          white={campDist.white ?? 0}
          blue={campDist.blue ?? 0}
        />
      </div>
    </Card>

    <!-- Controversy -->
    {#if controversyConfig()}
      <Card variant="filled">
        <div class="viz-section">
          <span class="section-label">平均爭議程度</span>
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
      </Card>
    {/if}

    <!-- Blindspot Alert -->
    {#if cluster.is_blindspot && blindspotLabel}
      <div class="blindspot-alert">
        <span class="material-symbols-outlined">warning</span>
        <div>
          <strong>{blindspotLabel}</strong>
          {#if cluster.missing_camp}
            <p class="alert-desc">此事件缺少{cluster.missing_camp === 'pan_green' ? '泛綠' : cluster.missing_camp === 'pan_blue' ? '泛藍' : '中立'}觀點的報導</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Cross-media Comparison Table -->
    {#if articlesBySource().length >= 2}
      <div class="comparison-section">
        <h2 class="section-heading">
          <span class="material-symbols-outlined">compare_arrows</span>
          跨媒體比較
        </h2>
        <div class="comparison-table">
          {#each articlesBySource() as [source, sourceArticles]}
            <div class="comparison-row">
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
                        偏向: {art.bias_score}
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Article Timeline -->
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
    gap: 16px;
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

  /* Header */
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
    color: var(--md-sys-color-on-tertiary-container);
    background: var(--md-sys-color-tertiary-container);
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
    font: var(--md-sys-typescale-headline-small-font);
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

  /* Viz */
  .viz-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .controversy-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .heat-bar-container {
    flex: 1;
    height: 6px;
    background: var(--md-sys-color-surface-container-high);
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

  /* Blindspot Alert */
  .blindspot-alert {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: var(--md-sys-color-error-container);
    border-radius: var(--md-sys-shape-corner-medium);
    color: var(--md-sys-color-on-error-container);
  }
  .blindspot-alert .material-symbols-outlined {
    flex-shrink: 0;
    font-size: 24px;
  }
  .blindspot-alert strong {
    font: var(--md-sys-typescale-title-small-font);
  }
  .alert-desc {
    margin: 4px 0 0;
    font: var(--md-sys-typescale-body-small-font);
  }

  /* Comparison */
  .comparison-section, .articles-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .section-heading .material-symbols-outlined {
    font-size: 20px;
    color: var(--md-sys-color-primary);
  }
  .comparison-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium);
    overflow: hidden;
  }
  .comparison-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--md-sys-color-surface-container-lowest);
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
  }
  .art-bias.green { color: var(--camp-green); }
  .art-bias.blue { color: var(--camp-blue); }

  /* Articles list */
  .articles-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
