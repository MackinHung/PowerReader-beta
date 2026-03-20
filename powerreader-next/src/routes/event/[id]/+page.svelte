<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import ShareCardButton from '$lib/components/share/ShareCardButton.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import BlindspotAlert from '$lib/components/data-viz/BlindspotAlert.svelte';
  import ClusterTimeline from '$lib/components/data-viz/ClusterTimeline.svelte';
  import AnalysisZone from '$lib/components/data-viz/AnalysisZone.svelte';
  import ArticleCard from '$lib/components/article/ArticleCard.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import GroupReport from '$lib/components/data-viz/GroupReport.svelte';
  import { t } from '$lib/i18n/zh-TW.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';
  import * as api from '$lib/core/api.js';
  import {
    getAnalysisState,
    getAnalysisProgress,
    groupArticlesBySource,
    buildShareData,
  } from '$lib/pages/event-detail.js';
  import {
    checkGroupReadiness,
    getGroupAnalysis,
    runGroupAnalysis,
  } from '$lib/core/group-analysis.js';

  const media = getMediaQueryStore();
  let clusterId = $derived(page.params.id);

  let cluster = $state(null);
  let articles = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let shareMsg = $state('');

  // Group analysis state
  let groupReport = $state(null);
  let groupLoading = $state(false);
  let groupError = $state(null);

  // Derived state using helper functions
  let campDist = $derived(cluster?.camp_distribution || {});
  let analysisState = $derived(getAnalysisState(cluster));
  let analysisProgress = $derived(getAnalysisProgress(cluster, articles));
  let articlesBySource = $derived(groupArticlesBySource(articles));

  // Build analyses map from articles that have bias_score (server-side analyzed)
  let analysesMap = $derived(() => {
    const map = new Map();
    for (const art of articles) {
      if (art.bias_score != null) {
        map.set(art.article_id, {
          bias_score: art.bias_score,
          camp_ratio: art.camp_ratio ?? null,
          is_political: art.is_political ?? true,
          emotion_intensity: art.emotion_intensity ?? 50,
          points: art.points ?? [],
          key_phrases: art.key_phrases ?? [],
          reasoning: '',
          stances: {},
          source_attribution: '',
          prompt_version: '',
          mode: '',
          latency_ms: 0,
        });
      }
    }
    return map;
  });

  let groupReadiness = $derived(checkGroupReadiness(articles, analysesMap()));

  let eventShareData = $derived(cluster ? {
    title: cluster.representative_title ?? '',
    articleCount: cluster.article_count ?? 0,
    sourceCount: cluster.source_count ?? 0,
    campDistribution: cluster.camp_distribution ?? null,
    blindspotType: cluster.is_blindspot ? (cluster.blindspot_type ?? null) : null,
    analysisProgress: {
      analyzed: analysisProgress.analyzed,
      total: analysisProgress.total,
    },
  } : null);

  $effect(() => {
    const id = clusterId;
    untrack(() => loadCluster(id));
  });

  async function loadCluster(id) {
    loading = true;
    error = null;
    cluster = null;
    articles = [];
    groupReport = null;
    groupError = null;
    try {
      const result = await api.fetchClusterDetail(id);
      if (result.success) {
        cluster = result.data?.cluster;
        articles = result.data?.articles || [];
        // Try loading cached group analysis
        try {
          const cached = await getGroupAnalysis(id);
          if (cached) groupReport = cached;
        } catch { /* ignore IDB errors */ }
      } else {
        error = result.error?.message || '無法載入事件';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function handleGroupAnalysis() {
    groupLoading = true;
    groupError = null;
    try {
      // Simple inference function using server endpoint
      async function runInference(systemPrompt, userMessage) {
        const response = await fetch('/api/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: userMessage,
            system_prompt: systemPrompt,
            model_params: { think: false, temperature: 0.5 },
          }),
        });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();
        return data.raw_output || JSON.stringify(data);
      }

      const result = await runGroupAnalysis(
        clusterId,
        articles,
        analysesMap(),
        runInference
      );
      groupReport = result;
    } catch (e) {
      groupError = e.message;
    } finally {
      groupLoading = false;
    }
  }

  function handleArticleClick(article) {
    goto(`/article/${article.article_id}`);
  }

  function handleArticleAnalyze(article) {
    goto(`/analyze/${article.article_id}`);
  }

  async function handleShare() {
    const data = buildShareData(cluster, clusterId);
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(data.url);
        shareMsg = '已複製連結';
        setTimeout(() => { shareMsg = ''; }, 2000);
      }
    } catch {
      // User cancelled share dialog
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
    <!-- BlindspotAlert banner (top-level, prominent) -->
    <BlindspotAlert type={cluster.blindspot_type} isBlindspot={analysisState !== 'none' && cluster.is_blindspot} />

    <!-- Header (Light) -->
    <div class="detail-header">
      <div class="header-row">
        <div class="header-badges">
          {#if cluster.category}
            <span class="category-badge">{cluster.category}</span>
          {/if}
          <span class="meta-badge">{cluster.article_count} 篇 · {cluster.source_count} 家媒體</span>
        </div>
        <div class="header-actions">
          {#if shareMsg}
            <span class="share-msg">{shareMsg}</span>
          {/if}
          {#if eventShareData}
            <ShareCardButton eventData={eventShareData} variant="icon" />
          {:else}
            <IconButton icon="share" label="分享" onclick={handleShare} />
          {/if}
        </div>
      </div>
      <h1 class="detail-title">{cluster.representative_title}</h1>
      <ClusterTimeline earliest={cluster.earliest_published_at} latest={cluster.latest_published_at} />
    </div>

    <!-- Analysis Zone (Dark) -->
    <AnalysisZone title="分析數據">
      <!-- Analysis Progress -->
      <div class="analysis-progress">
        <span class="progress-text">已分析 {analysisProgress.analyzed}/{analysisProgress.total} 篇</span>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: {analysisProgress.percentage}%"></div>
        </div>
      </div>

      {#if analysisState === 'none'}
        <!-- Empty state: no analysis yet -->
        <div class="zone-empty">
          <span class="material-symbols-outlined empty-icon">psychology</span>
          <p>尚無分析資料</p>
          <p class="empty-hint">協助分析此事件的文章，貢獻您的 GPU 算力</p>
        </div>
      {:else}
        <div class="zone-grid">
          <!-- Camp Distribution -->
          <div class="zone-item">
            <span class="zone-label">陣營比例</span>
            <CampBar
              green={campDist.green ?? 0}
              white={campDist.white ?? 0}
              blue={campDist.blue ?? 0}
              dark={true}
            />
          </div>
        </div>
      {/if}
    </AnalysisZone>

    <!-- Group Analysis Section -->
    {#if analysisState !== 'none'}
      <div class="group-analysis-section">
        <h2 class="section-heading">
          <span class="material-symbols-outlined">analytics</span>
          {t('group.title')}
        </h2>

        {#if groupReport}
          <!-- State C: completed -->
          <GroupReport report={groupReport} />
        {:else if groupReadiness.ready}
          <!-- State B: ready to generate -->
          <div class="group-action">
            <Button
              variant="outlined"
              onclick={handleGroupAnalysis}
              disabled={groupLoading}
            >
              {#if groupLoading}
                <ProgressIndicator type="circular" size="small" />
                {t('group.generating')}
              {:else}
                <span class="material-symbols-outlined">auto_awesome</span>
                {t('group.ready')}
              {/if}
            </Button>
            {#if groupError}
              <p class="group-error">{groupError}</p>
            {/if}
          </div>
        {:else}
          <!-- State A: not enough data -->
          <div class="group-not-ready">
            <span class="material-symbols-outlined not-ready-icon">hourglass_empty</span>
            <p>{t('group.not_ready', {
              sources: String(groupReadiness.source_count),
              articles: String(groupReadiness.analyzed_count)
            })}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Cross-media Comparison (Light) -->
    {#if articlesBySource.length >= 2}
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
          {#each articlesBySource as [source, sourceArticles], rowIdx}
            <div class="comparison-row" class:odd={rowIdx % 2 === 1}>
              <div class="comparison-source">
                <span class="source-name">{source}</span>
                <span class="source-count">{sourceArticles.length} 篇</span>
              </div>
              <div class="comparison-articles">
                {#each sourceArticles as art}
                  <button
                    class="comparison-article"
                    onclick={() => handleArticleClick(art)}
                  >
                    <span class="art-title">{art.title}</span>
                    {#if art.bias_score != null}
                      <span class="art-bias" class:green={art.bias_score <= 40} class:blue={art.bias_score >= 60}>
                        {art.bias_score}
                      </span>
                    {:else}
                      <span class="art-bias pending">待分析</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Related Articles (Light) — grouped by sub-cluster when available -->
    <div class="articles-section">
      <h2 class="section-heading">
        <span class="material-symbols-outlined">article</span>
        相關報導 ({articles.length})
      </h2>

      {#if cluster.sub_clusters?.length > 1}
        <!-- Grouped by sub-clusters -->
        {#each cluster.sub_clusters as sub, subIdx}
          {@const subArticleIds = new Set(sub.article_ids || [])}
          {@const subArticles = articles.filter(a => subArticleIds.has(a.article_id))}
          {#if subArticles.length > 0}
            <details class="sub-cluster-group" open>
              <summary class="sub-cluster-header">
                <span class="sub-cluster-label">{t('cluster.sub_event_prefix')}: {sub.representative_title}</span>
                <span class="sub-cluster-count">{subArticles.length} 篇</span>
              </summary>
              <div class="articles-list">
                {#each subArticles as article, i (article.article_id ?? i)}
                  <ArticleCard
                    {article}
                    onclick={() => handleArticleClick(article)}
                    onanalyze={() => handleArticleAnalyze(article)}
                  />
                {/each}
              </div>
            </details>
          {/if}
        {/each}

        <!-- Articles not in any sub-cluster (fallback) -->
        {@const allSubIds = new Set(cluster.sub_clusters.flatMap(s => s.article_ids || []))}
        {@const orphanArticles = articles.filter(a => !allSubIds.has(a.article_id))}
        {#if orphanArticles.length > 0}
          <div class="articles-list">
            {#each orphanArticles as article, i (article.article_id ?? i)}
              <ArticleCard
                {article}
                onclick={() => handleArticleClick(article)}
                onanalyze={() => handleArticleAnalyze(article)}
              />
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Flat list (no sub-clusters or single sub-cluster) -->
        <div class="articles-list">
          {#each articles as article, i (article.article_id ?? i)}
            <ArticleCard
              {article}
              onclick={() => handleArticleClick(article)}
              onanalyze={() => handleArticleAnalyze(article)}
            />
          {/each}
        </div>
      {/if}
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
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .header-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .share-msg {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-primary);
  }
  .category-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-primary-container);
    background: var(--md-sys-color-primary-container);
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .meta-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .detail-title {
    margin: 16px 0;
    font: 900 40px/1.2 var(--pr-font-sans);
    color: var(--pr-ink);
  }

  /* === Analysis Progress === */
  .analysis-progress {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .progress-text {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--pr-analysis-on-surface-variant);
    white-space: nowrap;
  }
  .progress-bar-container {
    flex: 1;
    height: 16px;
    background: #FFFFFF;
    border: 3px solid var(--pr-ink);
    border-radius: 0;
    box-shadow: 4px 4px 0px var(--pr-ink);
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: #00E5FF;
    border-radius: 0;
    border-right: 3px solid var(--pr-ink);
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }

  /* === Analysis Zone Empty State === */
  .zone-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    text-align: center;
  }
  .empty-icon {
    font-size: 40px;
    color: var(--pr-analysis-on-surface-variant);
    opacity: 0.5;
  }
  .zone-empty p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--pr-analysis-on-surface-variant);
  }
  .empty-hint {
    opacity: 0.7;
    font: var(--md-sys-typescale-body-small-font) !important;
  }

  /* === Zone Grid === */
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
  .section-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 24px 0 16px 0;
    padding-left: 0;
    border-left: none;
    font: 900 30px/36px var(--pr-font-sans);
    color: var(--pr-ink);
  }
  .section-heading .material-symbols-outlined {
    font-size: 40px;
    color: #FF5722;
    flex-shrink: 0;
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
    border-radius: 0;
    overflow: hidden;
    border: 4px solid var(--pr-ink);
    box-shadow: 8px 8px 0px var(--pr-ink);
    background: #FFFFFF;
  }
  .comparison-header-row {
    display: none;
    padding: 12px 16px;
    background: #000000;
    color: #FFFFFF;
    font: 900 16px var(--pr-font-sans);
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
    padding: 16px;
    background: #FFFFFF;
    border-top: 4px solid var(--pr-ink);
  }
  .comparison-row:first-of-type {
    border-top: none;
  }
  .comparison-row.odd {
    background: #F0F0F0;
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
    background: none;
    border: none;
    padding: 8px 12px;
    min-height: 44px;
    border-radius: 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }
  .comparison-article:hover {
    background: var(--md-sys-color-surface-container);
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

  /* === Group Analysis === */
  .group-analysis-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .group-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
  }
  .group-error {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-error);
  }
  .group-not-ready {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 16px;
    text-align: center;
    background: var(--md-sys-color-surface-container-low);
    border-radius: 0;
    border: 3px solid var(--pr-ink);
  }
  .not-ready-icon {
    font-size: 32px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.5;
  }
  .group-not-ready p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* === Sub-cluster Groups === */
  .sub-cluster-group {
    border: 3px solid var(--pr-ink);
    border-radius: 0;
    overflow: hidden;
  }
  .sub-cluster-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    background: var(--md-sys-color-surface-container-low);
    cursor: pointer;
    list-style: none;
  }
  .sub-cluster-header::-webkit-details-marker {
    display: none;
  }
  .sub-cluster-header::before {
    content: '';
    display: inline-block;
    width: 0;
    height: 0;
    border-left: 5px solid var(--md-sys-color-on-surface-variant);
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    margin-right: 8px;
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .sub-cluster-group[open] > .sub-cluster-header::before {
    transform: rotate(90deg);
  }
  .sub-cluster-label {
    font: 500 14px/20px var(--pr-font-serif);
    color: var(--md-sys-color-on-surface);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub-cluster-count {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
  }
  .sub-cluster-group > .articles-list {
    padding: 8px;
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
