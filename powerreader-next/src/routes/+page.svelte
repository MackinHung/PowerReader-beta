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
      <div class="hero-wrapper" onclick={() => handleClusterClick(hero)}>
        <div class="hero-offset-bg"></div>
        <button
          class="hero-card"
          aria-label="精選事件: {hero.representative_title}"
        >
          <div class="hero-badges">
            {#if hero.category}
              <span class="hero-category">{hero.category}</span>
            {/if}
            <div class="hero-heat">
              <span class="material-symbols-outlined icon">local_fire_department</span>
              熱度
            </div>
          </div>
          
          <h2 class="hero-title">{hero.representative_title ?? ''}</h2>
          
          <div class="hero-bottom-info">
            <div class="hero-stats">
              <div class="stat-block">
                <span class="stat-number">{hero.article_count ?? 0}</span>
                <span class="stat-label">相關報導</span>
              </div>
              <div class="stat-block">
                <span class="stat-number">{hero.source_count ?? 0}</span>
                <span class="stat-label">家媒體</span>
              </div>
            </div>

            <div class="hero-viz">
              {#if CampBar}
                {@const campRatio = getHeroCampRatio(hero)}
                {#if campRatio}
                  <div class="hero-camp-wrapper">
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
          </div>
        </button>
      </div>
    {/if}

    <!-- Section: Remaining Clusters -->
    {#if remainingClusters().length > 0}
      <h2 class="section-heading">
        <span class="material-symbols-outlined section-icon">bolt</span>
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
        <span class="material-symbols-outlined section-icon">bolt</span>
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
  .hero-wrapper {
    position: relative;
    margin-bottom: 56px;
    cursor: pointer;
  }
  .hero-wrapper:hover .hero-card {
    transform: translate(-4px, -4px);
  }
  .hero-offset-bg {
    position: absolute;
    inset: 0;
    background: #00E5FF;
    border: 4px solid var(--pr-ink);
    border-radius: 16px;
    transform: translate(12px, 12px);
    pointer-events: none;
  }
  .hero-card {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: #000000;
    color: #ffffff;
    border-radius: 16px;
    border: 4px solid var(--pr-ink);
    padding: 40px;
    min-height: 320px;
    width: 100%;
    position: relative;
    transition: transform 200ms ease;
    text-align: left;
    outline: none;
    z-index: 10;
  }
  .hero-badges {
    position: absolute;
    top: 24px;
    left: 24px;
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .hero-category {
    background: #FFE600;
    color: #000000;
    border: 2px solid var(--pr-ink);
    font: 900 18px var(--pr-font-sans);
    padding: 4px 16px;
    box-shadow: 2px 2px 0px var(--pr-ink);
  }
  .hero-heat {
    display: flex;
    align-items: center;
    background: #FF5722;
    color: #ffffff;
    border: 2px solid var(--pr-ink);
    font: 900 18px var(--pr-font-sans);
    padding: 4px 12px;
    box-shadow: 2px 2px 0px #ffffff;
  }
  .hero-heat .icon {
    font-size: 20px;
    margin-right: 4px;
  }
  .hero-title {
    font: 900 36px/1.2 var(--pr-font-sans);
    color: #ffffff;
    margin: 64px 0 24px 0;
    width: 75%;
    transition: color 200ms ease;
  }
  .hero-card:hover .hero-title {
    color: #CCFF00;
  }
  .hero-bottom-info {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    width: 100%;
  }
  .hero-stats {
    display: flex;
    gap: 24px;
  }
  .stat-block {
    display: flex;
    flex-direction: column;
  }
  .stat-number {
    font: 900 36px/1 var(--pr-font-sans);
    color: #ffffff;
  }
  .stat-label {
    font: 700 12px var(--pr-font-sans);
    color: #9ca3af;
    letter-spacing: 2px;
    margin-top: 4px;
  }
  .hero-viz {
    width: 41%; /* 5/12 approx */
    display: flex;
    justify-content: flex-end;
  }
  .hero-camp-wrapper {
    width: 100%;
  }

  /* === Section Heading === */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 24px 0 32px 0;
    padding-left: 0;
    border-left: none;
    font: 900 30px/36px var(--pr-font-sans);
    color: var(--pr-ink);
  }
  .section-icon {
    font-size: 32px;
    color: #FF5722;
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
