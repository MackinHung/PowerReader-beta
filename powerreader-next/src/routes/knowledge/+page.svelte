<script>
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import { KnowledgeCard } from '$lib/components/knowledge/index.js';
  import { getKnowledgeStore } from '$lib/stores/knowledge.svelte.js';
  import { isFigureType, isIssueType } from '$lib/utils/knowledge-constants.js';
  import { t } from '$lib/i18n/zh-TW.js';

  const store = getKnowledgeStore();

  const TYPE_TABS = [
    { key: 'all', label: () => t('knowledge.filter.all') },
    { key: 'figure', label: () => t('knowledge.type.figure') },
    { key: 'issue', label: () => t('knowledge.type.issue') },
    { key: 'incident', label: () => t('knowledge.type.incident') }
  ];

  const PARTY_TABS = [
    { key: 'all', label: () => t('knowledge.filter.all_parties') },
    { key: 'KMT', label: () => t('knowledge.party.KMT') },
    { key: 'DPP', label: () => t('knowledge.party.DPP') },
    { key: 'TPP', label: () => t('knowledge.party.TPP') }
  ];

  // Show party filter for types that have party data (issue always passes through)
  let showPartyFilter = $derived(
    store.activeType === 'all' || isFigureType(store.activeType) || isIssueType(store.activeType)
  );

  let searchInput = $state('');
  let searchTimeout = null;

  // Infinite scroll: show N entries at a time
  const PAGE_SIZE = 20;
  let visibleCount = $state(PAGE_SIZE);
  let sentinelEl = $state(null);

  // Reset visible count when filters change
  $effect(() => {
    // Read reactive deps
    store.activeType;
    store.activeParty;
    store.searchQuery;
    visibleCount = PAGE_SIZE;
  });

  // IntersectionObserver for load-more
  $effect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          visibleCount += PAGE_SIZE;
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });

  let visibleEntries = $derived(store.entries.slice(0, visibleCount));
  let hasMore = $derived(visibleCount < store.entries.length);

  function handleSearchInput(e) {
    searchInput = e.target.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      store.setSearch(searchInput);
    }, 300);
  }

  function clearSearch() {
    searchInput = '';
    store.setSearch('');
  }

  // Load knowledge data on mount
  $effect(() => {
    untrack(() => store.loadKnowledge());
  });
</script>

<div class="knowledge-page">
  <!-- Search -->
  <div class="search-bar">
    <span class="material-symbols-outlined search-icon">search</span>
    <input
      type="text"
      placeholder={t('knowledge.search_placeholder')}
      value={searchInput}
      oninput={handleSearchInput}
      class="search-input"
      aria-label={t('knowledge.search_placeholder')}
    />
    {#if searchInput}
      <button class="clear-btn" onclick={clearSearch} aria-label={t('search.clear')}>
        <span class="material-symbols-outlined">close</span>
      </button>
    {/if}
  </div>

  <!-- Type Chips (matching home page style) -->
  <div class="filter-chips">
    {#each TYPE_TABS as tab (tab.key)}
      <Chip
        label={tab.label()}
        selected={store.activeType === tab.key}
        onclick={() => store.setType(tab.key)}
        mode="tab"
      />
    {/each}
  </div>

  <!-- Party Chips (conditional) -->
  {#if showPartyFilter}
    <div class="filter-chips party-chips">
      {#each PARTY_TABS as tab (tab.key)}
        <Chip
          label={tab.label()}
          selected={store.activeParty === tab.key}
          onclick={() => store.setParty(tab.key)}
          mode="tab"
        />
      {/each}
    </div>
  {/if}

  <!-- Content -->
  {#if store.loading}
    <div class="loading-state">
      <span class="material-symbols-outlined spinning">progress_activity</span>
      <p>{t('common.label.loading')}</p>
    </div>
  {:else if store.error}
    <div class="error-state">
      <span class="material-symbols-outlined">error</span>
      <p>{t('knowledge.load_error')}</p>
      <button class="retry-btn" onclick={() => { store.clearFilters(); store.loadKnowledge(); }}>
        {t('common.button.retry')}
      </button>
    </div>
  {:else if store.entries.length === 0}
    <div class="empty-state">
      <span class="material-symbols-outlined">search_off</span>
      <p>{t('knowledge.empty')}</p>
      {#if store.activeType !== 'all' || store.activeParty !== 'all' || store.searchQuery}
        <button class="retry-btn" onclick={() => store.clearFilters()}>
          {t('knowledge.clear_filters')}
        </button>
      {/if}
    </div>
  {:else}
    <div class="results-count">
      {t('knowledge.results_count', { count: store.entries.length })}
    </div>
    <div class="knowledge-grid">
      {#each visibleEntries as entry (entry.id)}
        <KnowledgeCard
          {entry}
          onclick={() => goto(`/knowledge/${entry.id}`)}
        />
      {/each}
    </div>
    {#if hasMore}
      <div bind:this={sentinelEl} class="scroll-sentinel"></div>
    {/if}
  {/if}
</div>

<style>
  .knowledge-page {
    display: flex;
    flex-direction: column;
    gap: var(--pr-page-gap);
    padding: var(--pr-page-padding);
  }

  /* Search Bar */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--md-sys-color-surface-container);
    height: 52px;
    border: 3px solid var(--pr-ink);
    border-radius: 0;
    box-shadow: none;
    transition: box-shadow 150ms ease;
  }
  .search-bar:focus-within {
    box-shadow: 2px 2px 0px var(--pr-ink);
    outline: none;
  }
  .search-icon {
    color: var(--md-sys-color-on-surface-variant);
    font-size: 20px;
  }
  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    outline: none;
  }
  .search-input::placeholder {
    color: var(--md-sys-color-on-surface-variant);
  }
  .clear-btn {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--md-sys-color-on-surface-variant);
    padding: 4px;
    border-radius: 50%;
  }
  .clear-btn:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  /* Filter chips — matches home page .category-chips */
  .filter-chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 0;
  }
  .filter-chips::-webkit-scrollbar { display: none; }
  .party-chips {
    margin-top: -4px;
  }

  /* Grid */
  .knowledge-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--pr-page-gap);
  }
  @media (min-width: 768px) {
    .knowledge-grid {
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    }
  }

  /* States */
  .results-count {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .loading-state, .error-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }
  .loading-state .material-symbols-outlined,
  .error-state .material-symbols-outlined,
  .empty-state .material-symbols-outlined {
    font-size: 48px;
  }
  .spinning {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .retry-btn {
    padding: 0 16px;
    height: 32px;
    border-radius: 0;
    border: 3px solid var(--pr-ink);
    box-shadow: 2px 2px 0px var(--pr-ink);
    background: #FFFFFF;
    color: #000000;
    font: 900 14px var(--pr-font-sans);
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }
  .retry-btn:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--pr-ink);
  }
  .scroll-sentinel {
    height: 1px;
  }
</style>
