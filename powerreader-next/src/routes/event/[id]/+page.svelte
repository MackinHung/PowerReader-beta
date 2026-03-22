<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Accordion from '$lib/components/ui/Accordion.svelte';
  import ShareCardButton from '$lib/components/share/ShareCardButton.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import BlindspotAlert from '$lib/components/data-viz/BlindspotAlert.svelte';
  import ClusterTimeline from '$lib/components/data-viz/ClusterTimeline.svelte';
  import AnalysisZone from '$lib/components/data-viz/AnalysisZone.svelte';
  import ComparisonTable from '$lib/components/data-viz/ComparisonTable.svelte';
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
    getSubClusterArticles,
    getOrphanArticles,
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
        <h2 class="section-heading section-heading--accent">
          <span class="material-symbols-outlined">analytics</span>
          {t('group.title')}
        </h2>

        {#if groupReport}
          <GroupReport report={groupReport} />
        {:else if groupReadiness.ready}
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

    <!-- Cross-media Comparison -->
    <ComparisonTable {articlesBySource} onArticleClick={handleArticleClick} />

    <!-- Related Articles — grouped by sub-cluster when available -->
    <div class="articles-section">
      <h2 class="section-heading">
        <span class="material-symbols-outlined">article</span>
        相關報導 <span class="heading-count">({articles.length})</span>
      </h2>

      {#if cluster.sub_clusters?.length > 1}
        {#each cluster.sub_clusters as sub, subIdx}
          {@const subArticles = getSubClusterArticles(sub, articles)}
          {#if subArticles.length > 0}
            <Accordion
              title={sub.representative_title}
              badge="{subArticles.length} 篇"
              open={subIdx === 0}
            >
              <div class="articles-list">
                {#each subArticles as article, i (article.article_id ?? i)}
                  <ArticleCard
                    {article}
                    onclick={() => handleArticleClick(article)}
                    onanalyze={() => handleArticleAnalyze(article)}
                  />
                {/each}
              </div>
            </Accordion>
          {/if}
        {/each}

        <!-- Articles not in any sub-cluster (fallback) -->
        {@const orphanArticles = getOrphanArticles(cluster.sub_clusters, articles)}
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
    gap: var(--pr-section-gap-medium, 24px);
    padding: var(--pr-page-padding);
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
    padding-bottom: var(--pr-section-gap-small, 12px);
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
    font-size: var(--pr-detail-title);
    font-weight: 900;
    line-height: 1.2;
    font-family: var(--pr-font-sans);
    color: var(--pr-ink);
    overflow-wrap: break-word;
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
    border: 2px solid var(--pr-analysis-border);
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: #00E5FF;
    border-radius: 0;
    border-right: 2px solid var(--pr-analysis-border);
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

  /* === Section Headings (Differentiated Hierarchy) === */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: var(--pr-section-gap-large, 40px) 0 var(--pr-section-gap-small, 12px) 0;
    padding-left: 0;
    border-left: none;
    font: var(--pr-heading-secondary, 800 clamp(18px, 3vw, 24px)/1.3 var(--pr-font-sans));
    color: var(--pr-ink);
  }
  .section-heading .material-symbols-outlined {
    font-size: var(--pr-section-icon, clamp(20px, 3vw, 28px));
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
  /* Only Group Analysis gets orange accent */
  .section-heading--accent .material-symbols-outlined {
    color: #FF5722;
  }
  .heading-count {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    font-weight: 500;
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
    border-top: var(--pr-divider, 1px solid var(--md-sys-color-surface-container-high));
    border-bottom: var(--pr-divider, 1px solid var(--md-sys-color-surface-container-high));
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

  /* === Articles === */
  .articles-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .articles-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
