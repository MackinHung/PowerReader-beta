<script>
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import SearchBar from '$lib/components/ui/SearchBar.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import ArticleCard from '$lib/components/article/ArticleCard.svelte';
  import ResponsiveGrid from '$lib/components/ui/ResponsiveGrid.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import AnalysisDetailPanel from '$lib/components/analysis/AnalysisDetailPanel.svelte';
  import { getArticlesStore } from '$lib/stores/articles.svelte.js';
  import { getEventsStore } from '$lib/stores/events.svelte.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';

  // Dynamic imports for heavy components
  let ClusterCard = $state(null);
  let CampBar = $state(null);
  let SourceBadge = $state(null);

  $effect(() => {
    import('$lib/components/article/ClusterCardV2.svelte')
      .then(m => { ClusterCard = m.default; })
      .catch(() => {
        import('$lib/components/article/ClusterCard.svelte')
          .then(m => { ClusterCard = m.default; })
          .catch(() => {});
      });

    import('$lib/components/data-viz/CampBar.svelte')
      .then(m => { CampBar = m.default; })
      .catch(() => {});

    import('$lib/components/article/SourceBadge.svelte')
      .then(m => { SourceBadge = m.default; })
      .catch(() => {});
  });

  const store = getArticlesStore();
  const eventsStore = getEventsStore();
  const media = getMediaQueryStore();

  let searchValue = $state('');
  let selectedCategory = $state('all');
  let isSearching = $state(false);
  let sentinelEl = $state(null);
  let refreshStartY = $state(0);
  let refreshing = $state(false);

  // Detail panel state
  let detailArticle = $state(null);
  let detailOpen = $state(false);

  const categories = [
    { label: '全部', value: 'all' },
    { label: '政治', value: '政治' },
    { label: '社會', value: '社會' },
    { label: '國際', value: '國際' },
    { label: '兩岸', value: '兩岸' }
  ];

  // Unclustered articles loaded from article IDs
  let unclusteredArticles = $state([]);
  let unclusteredLoading = $state(false);

  function handleCategoryClick(value) {
    selectedCategory = value;
    isSearching = false;
    searchValue = '';
    eventsStore.refreshClusters(value === 'all' ? undefined : value);
    store.fetchArticles(value, 1);
  }

  function handleSearch(query) {
    if (query.trim()) {
      isSearching = true;
      store.searchArticles(query);
    } else {
      isSearching = false;
    }
  }

  async function handleRefresh() {
    refreshing = true;
    const cat = selectedCategory === 'all' ? undefined : selectedCategory;
    await Promise.allSettled([
      eventsStore.refreshClusters(cat),
      store.refreshArticles()
    ]);
    refreshing = false;
  }

  function handleTouchStart(e) {
    if (window.scrollY === 0) {
      refreshStartY = e.touches[0].clientY;
    }
  }

  function handleTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - refreshStartY;
    if (dy > 80 && window.scrollY === 0 && !refreshing) {
      handleRefresh();
    }
    refreshStartY = 0;
  }

  function handleArticleClick(article) {
    if (article.primary_url) {
      window.open(article.primary_url, '_blank', 'noopener');
    }
  }

  function handleClusterClick(cluster) {
    goto(`/event/${cluster.cluster_id}`);
  }

  function handleShowAnalysis(article) {
    detailArticle = article;
    detailOpen = true;
  }

  function handleCloseDetail() {
    detailOpen = false;
    detailArticle = null;
  }

  // Fetch clusters and articles on mount
  $effect(() => {
    untrack(() => {
      eventsStore.fetchClusters(1);
      store.fetchArticles('all', 1);
    });
  });

  // Load unclustered articles when IDs change
  $effect(() => {
    const ids = eventsStore.unclusteredArticleIds;
    if (ids.length === 0) {
      unclusteredArticles = [];
      return;
    }
    untrack(() => {
      const idSet = new Set(ids);
      const existing = store.articles.filter(a => idSet.has(a.article_id));
      if (existing.length > 0) {
        unclusteredArticles = existing;
      }
    });
  });

  // Infinite scroll
  $effect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (isSearching) {
            if (store.hasMore && !store.loading) store.loadMore();
          } else {
            const cat = selectedCategory === 'all' ? undefined : selectedCategory;
            if (eventsStore.clustersHasMore && !eventsStore.clustersLoading) {
              eventsStore.loadMoreClusters(cat);
            }
          }
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });

  // Sort clusters by article_count desc
  let sortedClusters = $derived(() => {
    return [...eventsStore.clusters].sort((a, b) => {
      return (b.article_count ?? 0) - (a.article_count ?? 0);
    });
  });

  // Hero cluster: first item from sorted list
  let heroCluster = $derived(() => {
    const sorted = sortedClusters();
    return sorted.length > 0 ? sorted[0] : null;
  });

  // Remaining clusters (after hero)
  let remainingClusters = $derived(() => {
    const sorted = sortedClusters();
    return sorted.length > 1 ? sorted.slice(1) : [];
  });

  let hasClusters = $derived(eventsStore.clusters.length > 0);
  let hasUnclustered = $derived(unclusteredArticles.length > 0);
  let showEmptyState = $derived(
    !isSearching && !eventsStore.clustersLoading && !hasClusters && !hasUnclustered
  );

  // Hero helpers
  function safeJsonParse(str, fallback) {
    if (typeof str !== 'string') return str || fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function getHeroSources(cluster) {
    const sources = safeJsonParse(cluster.sources_json, []);
    return sources.slice(0, 6).map(item => (typeof item === 'string' ? item : item.source));
  }

  function getHeroCampRatio(cluster) {
    return safeJsonParse(cluster.avg_camp_ratio, null);
  }
</script>

<svelte:head>
  <title>PowerReader - 台灣新聞立場分析 | 首頁</title>
</svelte:head>

<div
  class="home-page"
  role="application"
  tabindex="-1"
  ontouchstart={media.isMobile ? handleTouchStart : undefined}
  ontouchend={media.isMobile ? handleTouchEnd : undefined}
>
  <div class="search-section">
    <SearchBar bind:value={searchValue} placeholder="搜尋新聞..." onsearch={handleSearch} />
  </div>

  <div class="category-chips">
    {#each categories as cat}
      <Chip
        label={cat.label}
        selected={selectedCategory === cat.value}
        onclick={() => handleCategoryClick(cat.value)}
        mode="tab"
      />
    {/each}
  </div>

  {#if refreshing}
    <div class="refresh-indicator">
      <ProgressIndicator type="circular" />
    </div>
  {/if}

  {#if isSearching}
    <!-- Search Results Mode -->
    <ResponsiveGrid>
      {#each store.articles as article, i (article.article_id ?? i)}
        <ArticleCard
          {article}
          onclick={() => handleArticleClick(article)}
          onanalyze={() => handleShowAnalysis(article)}
        />
      {/each}
    </ResponsiveGrid>

    {#if store.loading}
      <div class="loading-indicator">
        <ProgressIndicator type="linear" />
      </div>
    {/if}

    {#if !store.loading && store.articles.length === 0}
      <div class="empty-state">
        <span class="material-symbols-outlined empty-icon">search_off</span>
        <p>找不到相關新聞</p>
      </div>
    {/if}
  {:else}
    <!-- Default Mode: Hero + Clusters + Unclustered -->

    {#if eventsStore.clustersLoading && eventsStore.clusters.length === 0}
      <div class="loading-indicator">
        <ProgressIndicator type="linear" />
      </div>
    {/if}

    <!-- Hero Card -->
    {#if heroCluster()}
      {@const hero = heroCluster()}
      <button
        class="hero-card"
        onclick={() => handleClusterClick(hero)}
        aria-label="精選事件: {hero.representative_title}"
      >
        <div class="hero-content">
          {#if hero.category}
            <span class="hero-category">{hero.category}</span>
          {/if}
          <h2 class="hero-title">{hero.representative_title ?? ''}</h2>
          <span class="hero-meta">{hero.article_count ?? 0} 篇報導 · {hero.source_count ?? 0} 家媒體</span>

          {#if hero.sub_clusters?.length > 1}
            <div class="hero-sub-events">
              {#each hero.sub_clusters.slice(0, 3) as sub}
                <span class="sub-event-chip">{sub.representative_title}</span>
              {/each}
              {#if hero.sub_clusters.length > 3}
                <span class="sub-event-more">+{hero.sub_clusters.length - 3}</span>
              {/if}
            </div>
          {/if}

          <div class="hero-viz">
            {#if CampBar}
              {@const campRatio = getHeroCampRatio(hero)}
              {#if campRatio}
                <div class="hero-camp">
                  <svelte:component this={CampBar}
                    green={campRatio.green ?? 0}
                    white={campRatio.white ?? 0}
                    blue={campRatio.blue ?? 0}
                    dark={true}
                  />
                </div>
              {/if}
            {/if}
          </div>

          <!-- Source badges -->
          {#if SourceBadge}
            {@const heroSources = getHeroSources(hero)}
            {#if heroSources.length > 0}
              <div class="hero-sources">
                {#each heroSources as src (src)}
                  <svelte:component this={SourceBadge} source={src} size="small" />
                {/each}
                {#if (safeJsonParse(hero.sources_json, []).length) > 6}
                  <span class="hero-extra">+{safeJsonParse(hero.sources_json, []).length - 6}</span>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

        <div class="hero-bottom-line"></div>
      </button>
    {/if}

    <!-- Section: Remaining Clusters -->
    {#if remainingClusters().length > 0}
      <h2 class="section-heading">
        <span class="material-symbols-outlined section-icon">radar</span>
        即時新聞雷達
      </h2>
      <ResponsiveGrid minColumnWidth="340px">
        {#each remainingClusters() as cluster (cluster.cluster_id)}
          {#if ClusterCard}
            <svelte:component
              this={ClusterCard}
              {cluster}
              onclick={() => handleClusterClick(cluster)}
            />
          {:else}
            <button
              class="cluster-fallback"
              onclick={() => handleClusterClick(cluster)}
            >
              <strong>{cluster.representative_title}</strong>
              <span>{cluster.article_count} 篇 · {cluster.source_count} 家媒體</span>
            </button>
          {/if}
        {/each}
      </ResponsiveGrid>

      {#if eventsStore.clustersLoading}
        <div class="loading-indicator">
          <ProgressIndicator type="linear" />
        </div>
      {/if}
    {:else if hasClusters}
      <!-- Only hero cluster exists, show section heading anyway for context -->
      <h2 class="section-heading">
        <span class="material-symbols-outlined section-icon">radar</span>
        即時新聞雷達
      </h2>
      {#if eventsStore.clustersLoading}
        <div class="loading-indicator">
          <ProgressIndicator type="linear" />
        </div>
      {/if}
    {/if}

    <!-- Section: Unclustered articles -->
    {#if hasUnclustered}
      <h2 class="section-heading">
        <span class="material-symbols-outlined section-icon">article</span>
        其他報導
      </h2>
      <ResponsiveGrid>
        {#each unclusteredArticles as article, i (article.article_id ?? i)}
          <ArticleCard
            {article}
            onclick={() => handleArticleClick(article)}
            onanalyze={() => handleShowAnalysis(article)}
          />
        {/each}
      </ResponsiveGrid>
    {/if}

    {#if showEmptyState}
      <div class="empty-state">
        <span class="material-symbols-outlined empty-icon">hub</span>
        <p>暫無新聞事件</p>
      </div>
    {/if}
  {/if}

  {#if (isSearching ? store.hasMore && store.articles.length > 0 : eventsStore.clustersHasMore && hasClusters)}
    <div bind:this={sentinelEl} class="scroll-sentinel"></div>
  {/if}
</div>

<AnalysisDetailPanel
  article={detailArticle}
  open={detailOpen}
  onclose={handleCloseDetail}
/>

<style>
  .home-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  .search-section {
    width: 100%;
  }
  .category-chips {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .category-chips::-webkit-scrollbar { display: none; }

  /* === Hero Card === */
  .hero-card {
    display: flex;
    flex-direction: column;
    background: var(--pr-analysis-surface);
    border-radius: var(--md-sys-shape-corner-medium);
    overflow: hidden;
    cursor: pointer;
    border: none;
    text-align: left;
    font: inherit;
    color: var(--pr-analysis-on-surface);
    width: 100%;
    position: relative;
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .hero-card:hover {
    transform: translateY(-2px);
  }
  .hero-card:focus-visible {
    outline: 2px solid var(--pr-gold);
    outline-offset: 2px;
  }
  .hero-content {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hero-category {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--pr-analysis-gold);
    background: rgba(201, 169, 110, 0.15);
    padding: 2px 12px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    align-self: flex-start;
  }
  .hero-title {
    font: 700 24px/32px var(--pr-font-serif);
    color: var(--pr-analysis-on-surface);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .hero-meta {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--pr-analysis-on-surface-variant);
  }
  .hero-sub-events {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sub-event-chip {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--pr-analysis-on-surface);
    background: rgba(255, 255, 255, 0.1);
    padding: 3px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }
  .sub-event-more {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--pr-analysis-on-surface-variant);
    padding: 3px 6px;
  }
  .hero-viz {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    flex-wrap: wrap;
  }
  .hero-viz-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--pr-analysis-on-surface-variant);
  }
  .hero-camp {
    flex: 1;
    min-width: 160px;
  }
  .hero-sources {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .hero-extra {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--pr-analysis-on-surface-variant);
  }
  .hero-bottom-line {
    height: 3px;
    background: linear-gradient(to right, var(--pr-gold), var(--pr-gold-muted), transparent);
  }

  /* === Section Heading === */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0 0;
    padding-left: 12px;
    border-left: 4px solid var(--pr-gold);
    font: 500 16px/24px var(--pr-font-serif);
    color: var(--md-sys-color-on-surface);
  }
  .section-icon {
    font-size: 20px;
    color: var(--pr-gold);
  }

  /* === Misc === */
  .refresh-indicator {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }
  .loading-indicator {
    padding: 16px 0;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    gap: 12px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .empty-icon {
    font-size: 48px;
    opacity: 0.6;
  }
  .empty-state p {
    margin: 0;
    font: var(--md-sys-typescale-body-large-font);
  }
  .scroll-sentinel {
    height: 1px;
  }
  .cluster-fallback {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-left: 3px solid var(--pr-gold);
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container-lowest);
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
    text-align: left;
    font: inherit;
    width: 100%;
  }
  .cluster-fallback strong {
    font: 500 14px/20px var(--pr-font-serif);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cluster-fallback span {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .cluster-fallback:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, var(--md-sys-color-surface-container-lowest));
  }

  @media (min-width: 768px) {
    .hero-title {
      font-size: 28px;
      line-height: 36px;
    }
    .hero-content {
      padding: 32px;
    }
  }
</style>
