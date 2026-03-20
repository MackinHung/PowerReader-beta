<script>
  import { untrack } from 'svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import ArticleCluster from '$lib/components/article/ArticleCluster.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import * as api from '$lib/core/api.js';

  let events = $state([]);
  let selectedEvent = $state('');
  let cluster = $state(null);
  let loading = $state(true);
  let clusterLoading = $state(false);
  let error = $state(null);

  let eventOptions = $derived(
    events.map(e => ({ label: e.title, value: e.cluster_id || e.event_id }))
  );

  $effect(() => {
    untrack(() => fetchEvents());
  });

  $effect(() => {
    const evt = selectedEvent;
    if (evt) {
      untrack(() => fetchCluster(evt));
    }
  });

  async function fetchEvents() {
    loading = true;
    try {
      const result = await api.fetchEvents();
      if (result.success) {
        events = result.data?.events || [];
        if (events.length > 0 && !selectedEvent) {
          selectedEvent = events[0].cluster_id || events[0].event_id;
        }
      } else {
        error = result.error?.message || '載入失敗';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function fetchCluster(eventId) {
    clusterLoading = true;
    try {
      const result = await api.fetchEventDetail(eventId);
      if (result.success) {
        cluster = result.data;
      }
    } catch (e) {
      console.error('Failed to load cluster:', e);
    } finally {
      clusterLoading = false;
    }
  }
</script>

<svelte:head>
  <title>媒體比較 | PowerReader</title>
</svelte:head>

<div class="compare-page">
  {#if loading}
    <div class="center-state">
      <ProgressIndicator type="circular" />
    </div>
  {:else if error}
    <div class="center-state">
      <span class="material-symbols-outlined error-icon">error</span>
      <p>{error}</p>
    </div>
  {:else if events.length === 0}
    <div class="center-state">
      <span class="material-symbols-outlined empty-icon">compare_arrows</span>
      <p>暫無可比較的事件</p>
    </div>
  {:else}
    <div class="event-selector">
      <Select options={eventOptions} bind:value={selectedEvent} label="選擇事件" />
    </div>

    {#if clusterLoading}
      <div class="center-state">
        <ProgressIndicator type="circular" />
      </div>
    {:else if cluster}
      <ArticleCluster
        articles={cluster.articles || []}
        divergenceScore={cluster.divergence_score ?? 0}
      />

      {#if cluster.articles?.length >= 2}
        <div class="comparison-grid">
          {#each cluster.articles.slice(0, 2) as article}
            <div class="compare-card">
              <div class="compare-source">
                <span class="source-name">{article.source}</span>
              </div>
              <h4 class="compare-title">{article.title}</h4>
              {#if article.bias_score != null}
                <span class="compare-bias">偏向: {article.bias_score > 0 ? '偏藍' : article.bias_score < 0 ? '偏綠' : '中立'}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .compare-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
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
  .empty-icon {
    font-size: 48px;
    opacity: 0.6;
  }
  .center-state p {
    margin: 0;
    font: var(--md-sys-typescale-body-large-font);
  }
  .event-selector {
    width: 100%;
  }
  .comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .compare-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
    box-shadow: 4px 4px 0px var(--pr-ink);
    background: var(--md-sys-color-surface-container-lowest);
  }
  .compare-source {
    display: flex;
    align-items: center;
  }
  .source-name {
    font: 900 14px var(--pr-font-sans);
    color: var(--pr-ink);
    letter-spacing: 0.5px;
  }
  .compare-title {
    margin: 0;
    font: 700 15px var(--pr-font-sans);
    color: var(--md-sys-color-on-surface);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }
  .compare-bias {
    font: 900 13px var(--pr-font-sans);
    color: var(--md-sys-color-on-surface-variant);
    border: 2px solid var(--pr-ink);
    padding: 2px 8px;
    display: inline-block;
    width: fit-content;
  }
</style>
