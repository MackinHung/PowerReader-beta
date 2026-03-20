<script>
  import { t } from '$lib/i18n/zh-TW.js';
  import { isFigureType, isIssueType } from '$lib/utils/knowledge-constants.js';

  let { entry, onclick } = $props();

  const TYPE_ICONS = {
    politician: 'person',
    figure: 'person',
    topic: 'topic',
    issue: 'topic',
    event: 'event',
    incident: 'event'
  };

  const PARTY_COLORS = {
    KMT: '#0047AB',
    DPP: '#1B9431',
    TPP: '#28C8C8',
    NPP: '#FBBE01',
    TSP: '#C7002E'
  };

  let entryIsIssue = $derived(isIssueType(entry?.type));
  let icon = $derived(TYPE_ICONS[entry?.type] || 'article');
  let typeLabel = $derived(t(`knowledge.type.${entry?.type}`) || entry?.type || '');
  let partyLabel = $derived(
    !entryIsIssue && entry?.party ? t(`knowledge.party.${entry.party}`) || entry.party : null
  );
  let partyColor = $derived(
    !entryIsIssue && entry?.party ? (PARTY_COLORS[entry.party] || '#888') : null
  );
  let snippet = $derived(() => {
    if (entryIsIssue) return '';
    // Prefer structured field, fall back to content
    const c = entry?.background || entry?.description || entry?.content || '';
    return c.length > 120 ? c.slice(0, 120) + '...' : c;
  });
</script>

<button
  class="knowledge-card"
  onclick={onclick}
  type="button"
  style={partyColor ? `border-left: 8px solid ${partyColor}` : ''}
>
  <div class="card-header">
    <span class="material-symbols-outlined type-icon">{icon}</span>
    <span class="type-badge">{typeLabel}</span>
    {#if partyLabel}
      <span class="party-badge" style="background-color: {partyColor}">{partyLabel}</span>
    {/if}
  </div>
  <h3 class="card-title">{entry?.title || ''}</h3>
  {#if entryIsIssue}
    <div class="stance-dots">
      <span class="dot" style="background-color: #1B9431"></span>
      <span class="dot" style="background-color: #0047AB"></span>
      <span class="dot" style="background-color: #28C8C8"></span>
      <span class="stance-label">{t('knowledge.stances.compare')}</span>
    </div>
  {:else}
    <p class="card-snippet">{snippet()}</p>
  {/if}
</button>

<style>
  .knowledge-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
    background: #FFFFFF;
    border: 4px solid var(--pr-ink);
    border-radius: 0;
    box-shadow: 6px 6px 0px var(--pr-ink);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: transform 150ms ease, box-shadow 150ms ease;
    font-family: var(--pr-font-sans);
  }
  .knowledge-card:hover {
    transform: translate(-4px, -4px);
    box-shadow: 10px 10px 0px var(--pr-ink);
  }
  .knowledge-card:focus-visible {
    outline: 4px solid #FF5722;
    outline-offset: 4px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .type-icon {
    font-size: 22px;
    color: var(--pr-ink);
    font-variation-settings: 'FILL' 1, 'wght' 700;
  }
  .type-badge {
    font: 900 12px var(--pr-font-sans);
    color: var(--pr-ink);
    background: var(--md-sys-color-primary-container);
    padding: 2px 10px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
  }
  .party-badge {
    font: 900 12px var(--pr-font-sans);
    color: #fff;
    padding: 2px 10px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
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

  .stance-dots {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .stance-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: 2px;
  }
</style>
