<script>
  import { t } from '$lib/i18n/zh-TW.js';

  let { entry, onclick } = $props();

  const TYPE_ICONS = {
    politician: 'person',
    media: 'newspaper',
    topic: 'topic',
    term: 'menu_book',
    event: 'event'
  };

  const PARTY_COLORS = {
    KMT: '#0047AB',
    DPP: '#1B9431',
    TPP: '#28C8C8',
    NPP: '#FBBE01',
    TSP: '#C7002E'
  };

  let icon = $derived(TYPE_ICONS[entry?.type] || 'article');
  let typeLabel = $derived(t(`knowledge.type.${entry?.type}`) || entry?.type || '');
  let partyLabel = $derived(entry?.party ? t(`knowledge.party.${entry.party}`) || entry.party : null);
  let partyColor = $derived(entry?.party ? (PARTY_COLORS[entry.party] || '#888') : null);
  let snippet = $derived(
    (entry?.content || '').length > 120
      ? (entry.content || '').slice(0, 120) + '...'
      : (entry?.content || '')
  );
</script>

<button class="knowledge-card" onclick={onclick} type="button">
  <div class="card-header">
    <span class="material-symbols-outlined type-icon">{icon}</span>
    <span class="type-badge">{typeLabel}</span>
    {#if partyLabel}
      <span class="party-badge" style="background-color: {partyColor}">{partyLabel}</span>
    {/if}
  </div>
  <h3 class="card-title">{entry?.title || ''}</h3>
  <p class="card-snippet">{snippet}</p>
</button>

<style>
  .knowledge-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--md-sys-color-surface-container-low);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.2s, box-shadow 0.2s;
    font-family: inherit;
  }
  .knowledge-card:hover {
    background: var(--md-sys-color-surface-container);
    box-shadow: var(--md-sys-elevation-1);
  }
  .knowledge-card:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .type-icon {
    font-size: 18px;
    color: var(--md-sys-color-primary);
  }
  .type-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-primary-container);
    background: var(--md-sys-color-primary-container);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }
  .party-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: #fff;
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }

  .card-title {
    margin: 0;
    font: var(--pr-heading-font, var(--md-sys-typescale-title-medium-font));
    color: var(--md-sys-color-on-surface);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-snippet {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }
</style>
