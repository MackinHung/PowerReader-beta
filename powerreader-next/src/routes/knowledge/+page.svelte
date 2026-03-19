<script>
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { KnowledgeCard } from '$lib/components/knowledge/index.js';
  import { getKnowledgeStore } from '$lib/stores/knowledge.svelte.js';
  import { t } from '$lib/i18n/zh-TW.js';

  const store = getKnowledgeStore();

  const TYPE_TABS = [
    { key: 'all', label: () => t('knowledge.filter.all') },
    { key: 'politician', label: () => t('knowledge.type.politician') },
    { key: 'media', label: () => t('knowledge.type.media') },
    { key: 'topic', label: () => t('knowledge.type.topic') },
    { key: 'event', label: () => t('knowledge.type.event') }
  ];

  const PARTY_TABS = [
    { key: 'all', label: () => t('knowledge.filter.all_parties') },
    { key: 'KMT', label: () => t('knowledge.party.KMT') },
    { key: 'DPP', label: () => t('knowledge.party.DPP') },
    { key: 'TPP', label: () => t('knowledge.party.TPP') }
  ];

  // Show party filter for types that have party data (topic always passes through)
  let showPartyFilter = $derived(
    store.activeType === 'all' || store.activeType === 'politician' || store.activeType === 'topic'
  );

  let searchInput = $state('');
  let searchTimeout = null;

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

  function getTypeCount(type) {
    if (type === 'all') return store.allEntries.length;
    return store.typeCounts[type] || 0;
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

  <!-- Type Chips -->
  <div class="chip-row" role="tablist" aria-label={t('knowledge.filter_type')}>
    {#each TYPE_TABS as tab (tab.key)}
      {@const count = getTypeCount(tab.key)}
      <button
        class="chip"
        class:active={store.activeType === tab.key}
        onclick={() => store.setType(tab.key)}
        role="tab"
        aria-selected={store.activeType === tab.key}
      >
        {tab.label()}
        <span class="chip-count">{count}</span>
      </button>
    {/each}
  </div>

  <!-- Party Chips (conditional) -->
  {#if showPartyFilter}
    <div class="chip-row party-chips" role="tablist" aria-label={t('knowledge.filter_party')}>
      {#each PARTY_TABS as tab (tab.key)}
        <button
          class="chip chip-party"
          class:active={store.activeParty === tab.key}
          onclick={() => store.setParty(tab.key)}
          role="tab"
          aria-selected={store.activeParty === tab.key}
        >
          {tab.label()}
        </button>
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
      {#each store.entries as entry (entry.id)}
        <KnowledgeCard
          {entry}
          onclick={() => goto(`/knowledge/${entry.id}`)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .knowledge-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  /* Search Bar */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--md-sys-color-surface-container);
    border-radius: var(--md-sys-shape-corner-full, 28px);
    border: 1px solid var(--md-sys-color-outline-variant);
  }
  .search-bar:focus-within {
    border-color: var(--md-sys-color-primary);
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

  /* Chips */
  .chip-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 2px 0;
  }
  .chip-row::-webkit-scrollbar { display: none; }

  .chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    border: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .chip:hover {
    background: var(--md-sys-color-surface-container);
  }
  .chip.active {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border-color: var(--md-sys-color-primary);
  }
  .chip-count {
    font: var(--md-sys-typescale-label-small-font);
    opacity: 0.8;
  }

  .party-chips {
    margin-top: -4px;
  }

  /* Grid */
  .knowledge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
  @media (max-width: 375px) {
    .knowledge-grid {
      grid-template-columns: 1fr;
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
    padding: 8px 16px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    border: 1px solid var(--md-sys-color-outline);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-primary);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .retry-btn:hover {
    background: var(--md-sys-color-surface-container);
  }
</style>
