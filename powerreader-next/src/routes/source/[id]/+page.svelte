<script>
  import { page } from '$app/state';
  import Card from '$lib/components/ui/Card.svelte';
  import SourceBadge from '$lib/components/article/SourceBadge.svelte';
  import TrendChart from '$lib/components/data-viz/TrendChart.svelte';
  import ArticleCard from '$lib/components/article/ArticleCard.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import * as api from '$lib/core/api.js';

  let sourceId = $derived(page.params.id);
  let sourceData = $state(null);
  let articles = $state([]);
  let trendData = $state([]);
  let loading = $state(true);
  let error = $state(null);

  $effect(() => {
    loadSource(sourceId);
  });

  async function loadSource(id) {
    loading = true;
    error = null;
    try {
      const result = await api.fetchSource(id);
      if (result.success) {
        sourceData = result.data?.source;
        articles = result.data?.articles || [];
        trendData = result.data?.trend || [];
      } else {
        error = result.error?.message || '載入失敗';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="source-page">
  {#if loading}
    <div class="center-state">
      <ProgressIndicator type="circular" />
    </div>
  {:else if error}
    <div class="center-state">
      <span class="material-symbols-outlined error-icon">error</span>
      <p>{error}</p>
    </div>
  {:else if sourceData}
    <div class="source-header">
      <SourceBadge source={sourceId} size="medium" />
      <h2 class="source-name">{sourceData.name || sourceId}</h2>
    </div>

    <div class="stats-row">
      <Card variant="filled">
        <div class="stat-card">
          <span class="stat-value">{sourceData.article_count ?? 0}</span>
          <span class="stat-label">文章數</span>
        </div>
      </Card>
      <Card variant="filled">
        <div class="stat-card">
          <span class="stat-value">{sourceData.avg_bias?.toFixed(1) ?? '-'}</span>
          <span class="stat-label">平均偏向</span>
        </div>
      </Card>
    </div>

    {#if trendData.length >= 2}
      <section class="section">
        <h3 class="section-title">偏向趨勢</h3>
        <TrendChart data={trendData} />
      </section>
    {/if}

    {#if articles.length > 0}
      <section class="section">
        <h3 class="section-title">最近文章</h3>
        <div class="article-list">
          {#each articles as article (article.article_hash || article.article_id)}
            <ArticleCard {article} />
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .source-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    gap: 12px;
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
  .source-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .source-name {
    margin: 0;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .stats-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px;
  }
  .stat-value {
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-primary);
  }
  .stat-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .article-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
