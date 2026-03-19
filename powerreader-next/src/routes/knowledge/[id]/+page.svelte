<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { getKnowledgeStore } from '$lib/stores/knowledge.svelte.js';
  import { TopicStanceView } from '$lib/components/knowledge/index.js';
  import { t } from '$lib/i18n/zh-TW.js';

  const store = getKnowledgeStore();

  const TYPE_ICONS = {
    politician: 'person',
    media: 'newspaper',
    topic: 'topic',
    event: 'event'
  };

  const PARTY_COLORS = {
    KMT: '#0047AB',
    DPP: '#1B9431',
    TPP: '#28C8C8',
    NPP: '#FBBE01',
    TSP: '#C7002E'
  };

  let entryId = $derived(page.params.id);
  let entry = $derived(store.getEntry(entryId));
  let isTopic = $derived(entry?.type === 'topic');
  let icon = $derived(entry ? (TYPE_ICONS[entry.type] || 'article') : 'article');
  let typeLabel = $derived(entry ? (t(`knowledge.type.${entry.type}`) || entry.type) : '');
  let partyLabel = $derived(
    !isTopic && entry?.party ? (t(`knowledge.party.${entry.party}`) || entry.party) : null
  );
  let partyColor = $derived(
    !isTopic && entry?.party ? (PARTY_COLORS[entry.party] || '#888') : null
  );

  // Ensure knowledge is loaded
  $effect(() => {
    untrack(() => store.loadKnowledge());
  });
</script>

<div class="detail-page">
  <a href="/knowledge" class="back-link">
    <span class="material-symbols-outlined">arrow_back</span>
    {t('knowledge.back_to_list')}
  </a>

  {#if store.loading}
    <div class="loading-state">
      <span class="material-symbols-outlined spinning">progress_activity</span>
      <p>{t('common.label.loading')}</p>
    </div>
  {:else if !entry}
    <div class="not-found">
      <span class="material-symbols-outlined">search_off</span>
      <p>{t('knowledge.not_found')}</p>
      <a href="/knowledge" class="retry-btn">{t('knowledge.back_to_list')}</a>
    </div>
  {:else}
    <article class="entry-detail">
      <div class="entry-header">
        <span class="material-symbols-outlined entry-icon">{icon}</span>
        <span class="type-badge">{typeLabel}</span>
        {#if partyLabel}
          <span class="party-badge" style="background-color: {partyColor}">{partyLabel}</span>
        {/if}
      </div>

      <h1 class="entry-title">{entry.title}</h1>

      <div class="entry-id">
        <span class="material-symbols-outlined">tag</span>
        {entry.id}
      </div>

      {#if isTopic && entry.stances}
        <TopicStanceView stances={entry.stances} />
      {:else}
        <div class="entry-content">
          {entry.content}
        </div>
      {/if}
    </article>
  {/if}
</div>

<style>
  .detail-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 720px;
    margin: 0 auto;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--md-sys-color-primary);
    text-decoration: none;
    font: var(--md-sys-typescale-label-large-font);
    padding: 4px 0;
  }
  .back-link:hover {
    text-decoration: underline;
  }

  .entry-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    background: var(--md-sys-color-surface-container-low);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .entry-icon {
    font-size: 24px;
    color: var(--md-sys-color-primary);
  }
  .type-badge {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-primary-container);
    background: var(--md-sys-color-primary-container);
    padding: 4px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }
  .party-badge {
    font: var(--md-sys-typescale-label-medium-font);
    color: #fff;
    padding: 4px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }

  .entry-title {
    margin: 0;
    font: var(--pr-heading-font, var(--md-sys-typescale-headline-small-font));
    color: var(--md-sys-color-on-surface);
  }

  .entry-id {
    display: flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .entry-id .material-symbols-outlined {
    font-size: 14px;
  }

  .entry-content {
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* States */
  .loading-state, .not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }
  .loading-state .material-symbols-outlined,
  .not-found .material-symbols-outlined {
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
    text-decoration: none;
  }
  .retry-btn:hover {
    background: var(--md-sys-color-surface-container);
  }
</style>
