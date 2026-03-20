<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import SourceBadge from '$lib/components/article/SourceBadge.svelte';
  import ResponsiveGrid from '$lib/components/ui/ResponsiveGrid.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import * as api from '$lib/core/api.js';

  let blindspots = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let selectedSource = $state('all');

  const sources = [
    { label: '全部', value: 'all' },
    { label: '自由時報', value: 'liberty_times' },
    { label: '中時', value: 'chinatimes' },
    { label: '聯合', value: 'udn' },
    { label: '中央社', value: 'cna' },
    { label: '三立', value: 'set_news' },
    { label: 'TVBS', value: 'tvbs' }
  ];

  $effect(() => {
    untrack(() => fetchBlindspots());
  });

  async function fetchBlindspots() {
    loading = true;
    error = null;
    try {
      const result = await api.fetchBlindspotEvents();
      if (result.success) {
        blindspots = result.data?.events || result.data?.blindspots || [];
      } else {
        error = result.error?.message || '載入失敗';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  let filtered = $derived(
    selectedSource === 'all'
      ? blindspots
      : blindspots.filter(b =>
          b.missing_sources?.includes(selectedSource) ||
          b.covering_sources?.includes(selectedSource)
        )
  );
</script>

<div class="blindspot-page">
  <div class="filter-chips">
    {#each sources as src}
      <Chip
        label={src.label}
        selected={selectedSource === src.value}
        onclick={() => selectedSource = src.value}
      />
    {/each}
  </div>

  {#if loading}
    <div class="center-state">
      <ProgressIndicator type="circular" />
    </div>
  {:else if error}
    <div class="center-state">
      <span class="material-symbols-outlined error-icon">error</span>
      <p>{error}</p>
    </div>
  {:else if filtered.length === 0}
    <div class="center-state">
      <span class="material-symbols-outlined empty-icon">visibility_off</span>
      <p>目前未偵測到報導盲區</p>
    </div>
  {:else}
    <ResponsiveGrid minColumnWidth="300px">
      {#each filtered as spot}
        <Card variant="elevated">
          <div class="spot-card">
            <h3 class="spot-topic">{spot.topic}</h3>
            {#if spot.covering_sources?.length}
              <div class="source-group">
                <span class="group-label">有報導</span>
                <div class="badge-row">
                  {#each spot.covering_sources as src}
                    <SourceBadge source={src} />
                  {/each}
                </div>
              </div>
            {/if}
            {#if spot.missing_sources?.length}
              <div class="source-group">
                <span class="group-label missing">未報導</span>
                <div class="badge-row">
                  {#each spot.missing_sources as src}
                    <SourceBadge source={src} />
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </Card>
      {/each}
    </ResponsiveGrid>
  {/if}
</div>

<style>
  .blindspot-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }
  .filter-chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 0;
  }
  .filter-chips::-webkit-scrollbar { display: none; }
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
  .empty-icon {
    font-size: 48px;
    opacity: 0.6;
  }
  .center-state p {
    margin: 0;
    font: var(--md-sys-typescale-body-large-font);
  }
  .spot-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .spot-topic {
    margin: 0;
    font: 900 18px var(--pr-font-sans);
    color: var(--pr-ink);
    letter-spacing: 0.5px;
  }
  .source-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group-label {
    font: 900 13px var(--pr-font-sans);
    color: #4CAF50;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .group-label.missing {
    color: #E53935;
  }
  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
