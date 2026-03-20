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

  const SOURCE_LABELS = {
    ai: () => t('knowledge.source.ai'),
    human: () => t('knowledge.source.human'),
    community: () => t('knowledge.source.community')
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
  let sourceLabel = $derived(
    entry?.source_type && SOURCE_LABELS[entry.source_type]
      ? SOURCE_LABELS[entry.source_type]()
      : null
  );
  let snippet = $derived(() => {
    if (entryIsIssue) return '';
    // Prefer structured field, fall back to content
    const c = entry?.background || entry?.description || entry?.content || '';
    return c.length > 120 ? c.slice(0, 120) + '...' : c;
  });
</script>

<button class="knowledge-card" onclick={onclick} type="button">
  <div class="card-header">
    <span class="material-symbols-outlined type-icon">{icon}</span>
    <span class="type-badge">{typeLabel}</span>
    {#if partyLabel}
      <span class="party-badge" style="background-color: {partyColor}">{partyLabel}</span>
    {/if}
    {#if sourceLabel}
      <span class="source-badge">{sourceLabel}</span>
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
  .source-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-tertiary-container);
    background: var(--md-sys-color-tertiary-container);
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
