<script>
  import { untrack } from 'svelte';
  import SearchBar from '$lib/components/ui/SearchBar.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import ArticleCard from '$lib/components/article/ArticleCard.svelte';
  import EventCard from '$lib/components/article/EventCard.svelte';
  import ResponsiveGrid from '$lib/components/ui/ResponsiveGrid.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import AnalysisDetailPanel from '$lib/components/analysis/AnalysisDetailPanel.svelte';
  import { getArticlesStore } from '$lib/stores/articles.svelte.js';
  import { getEventsStore } from '$lib/stores/events.svelte.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';

  const store = getArticlesStore();
  const eventsStore = getEventsStore();
  const media = getMediaQueryStore();

  let searchValue = $state('');
  let selectedCategory = $state('all');
  let viewMode = $state('events');
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

  function handleCategoryClick(value) {
    selectedCategory = value;
    store.fetchArticles(value, 1);
  }

  function handleSearch(query) {
    if (query.trim()) {
      viewMode = 'articles';
    }
    store.searchArticles(query);
  }

  async function handleRefresh() {
    refreshing = true;
    if (viewMode === 'events') {
      await eventsStore.refreshEvents();
    } else {
      await store.refreshArticles();
    }
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

  function handleShowAnalysis(article) {
    detailArticle = article;
    detailOpen = true;
  }

  function handleCloseDetail() {
    detailOpen = false;
    detailArticle = null;
  }

  function handleEventToggle(event) {
    if (eventsStore.getExpandedArticles(event.cluster_id)) {
      eventsStore.collapseEvent(event.cluster_id);
    } else {
      eventsStore.expandEvent(event.cluster_id, event.title);
    }
  }

  // Fetch both articles and events on mount
  $effect(() => {
    untrack(() => {
      store.fetchArticles('all', 1);
      eventsStore.fetchEvents(1);
    });
  });

  // IntersectionObserver for infinite scroll (mode-aware)
  $effect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (viewMode === 'events' && eventsStore.hasMore && !eventsStore.loading) {
            eventsStore.loadMore();
          } else if (viewMode === 'articles' && store.hasMore && !store.loading) {
            store.loadMore();
          }
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });

  let activeLoading = $derived(viewMode === 'events' ? eventsStore.loading : store.loading);
  let activeHasMore = $derived(viewMode === 'events' ? eventsStore.hasMore : store.hasMore);
  let activeHasItems = $derived(
    viewMode === 'events' ? eventsStore.events.length > 0 : store.articles.length > 0
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

  <div class="view-toggle">
    <Chip
      label="事件集群"
      icon="hub"
      selected={viewMode === 'events'}
      onclick={() => viewMode = 'events'}
    />
    <Chip
      label="全部文章"
      icon="article"
      selected={viewMode === 'articles'}
      onclick={() => viewMode = 'articles'}
    />
  </div>

  {#if viewMode === 'articles'}
    <div class="category-chips">
      {#each categories as cat}
        <Chip
          label={cat.label}
          selected={selectedCategory === cat.value}
          onclick={() => handleCategoryClick(cat.value)}
        />
      {/each}
    </div>
  {/if}

  {#if refreshing}
    <div class="refresh-indicator">
      <ProgressIndicator type="circular" />
    </div>
  {/if}

  {#if viewMode === 'events'}
    <ResponsiveGrid minColumnWidth="360px">
      {#each eventsStore.events as event (event.cluster_id)}
        <EventCard
          {event}
          expanded={!!eventsStore.getExpandedArticles(event.cluster_id)}
          articles={eventsStore.getExpandedArticles(event.cluster_id) || []}
          articlesLoading={eventsStore.expandingId === event.cluster_id}
          ontoggle={() => handleEventToggle(event)}
          onArticleClick={(a) => handleArticleClick(a)}
          onArticleAnalyze={(a) => handleShowAnalysis(a)}
        />
      {/each}
    </ResponsiveGrid>
  {:else}
    <ResponsiveGrid>
      {#each store.articles as article (article.article_hash || article.article_id)}
        <ArticleCard
          {article}
          onclick={() => handleArticleClick(article)}
          onanalyze={() => handleShowAnalysis(article)}
        />
      {/each}
    </ResponsiveGrid>
  {/if}

  {#if activeLoading}
    <div class="loading-indicator">
      <ProgressIndicator type="linear" />
    </div>
  {/if}

  {#if !activeLoading && !activeHasItems}
    <div class="empty-state">
      <span class="material-symbols-outlined empty-icon">
        {viewMode === 'events' ? 'hub' : 'article'}
      </span>
      <p>{viewMode === 'events' ? '暫無事件集群' : '暫無新聞'}</p>
    </div>
  {/if}

  {#if activeHasMore && activeHasItems}
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
  .view-toggle {
    display: flex;
    gap: 8px;
  }
  .category-chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 0;
  }
  .category-chips::-webkit-scrollbar { display: none; }
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
</style>
