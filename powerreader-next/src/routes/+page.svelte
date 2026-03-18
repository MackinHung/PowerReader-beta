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

  // Dynamic import for ClusterCard (may not exist during initial build)
  let ClusterCard = $state(null);
  $effect(() => {
    import('$lib/components/article/ClusterCard.svelte')
      .then(m => { ClusterCard = m.default; })
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
    // Use the articles already loaded in the store
    untrack(() => {
      const existing = store.articles.filter(a => ids.includes(a.article_id));
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

  let hasClusters = $derived(eventsStore.clusters.length > 0);
  let hasUnclustered = $derived(unclusteredArticles.length > 0);
  let showEmptyState = $derived(
    !isSearching && !eventsStore.clustersLoading && !hasClusters && !hasUnclustered
  );
</script>

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
      />
    {/each}
  </div>

  {#if refreshing}
    <div class="refresh-indicator">
      <ProgressIndicator type="circular" />
    </div>
  {/if}

  {#if isSearching}
    <!-- Search Results Mode: flat article list -->
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
    <!-- Default Mode: Cluster cards + unclustered articles -->

    <!-- Section 1: 新聞事件 (Clusters) -->
    {#if eventsStore.clustersLoading && eventsStore.clusters.length === 0}
      <div class="loading-indicator">
        <ProgressIndicator type="linear" />
      </div>
    {/if}

    {#if hasClusters}
      <h2 class="section-heading">
        <span class="material-symbols-outlined section-icon">hub</span>
        新聞事件
      </h2>
      <ResponsiveGrid minColumnWidth="360px">
        {#each eventsStore.clusters as cluster (cluster.cluster_id)}
          {#if ClusterCard}
            <svelte:component
              this={ClusterCard}
              {cluster}
              onclick={() => handleClusterClick(cluster)}
            />
          {:else}
            <!-- Fallback while ClusterCard loads -->
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
    {/if}

    <!-- Section 2: 其他報導 (Unclustered articles) -->
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
    gap: 12px;
    padding: 12px 16px;
  }
  .search-section {
    width: 100%;
  }
  .category-chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 0;
  }
  .category-chips::-webkit-scrollbar { display: none; }
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .section-icon {
    font-size: 20px;
    color: var(--md-sys-color-primary);
  }
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
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container-lowest);
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
    text-align: left;
    font: inherit;
    width: 100%;
  }
  .cluster-fallback strong {
    font: var(--md-sys-typescale-title-small-font);
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
</style>
