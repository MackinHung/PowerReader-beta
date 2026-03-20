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

  const PARTY_LOGOS = {
    KMT: '/icons/parties/kmt.svg',
    DPP: '/icons/parties/dpp.svg',
    TPP: '/icons/parties/tpp.svg'
  };

  let entryIsFigure = $derived(isFigureType(entry?.type));
  let entryIsIssue = $derived(isIssueType(entry?.type));
  let icon = $derived(TYPE_ICONS[entry?.type] || 'article');
  let typeLabel = $derived(t(`knowledge.type.${entry?.type}`) || entry?.type || '');
  let partyLabel = $derived(
    entry?.party ? t(`knowledge.party.${entry.party}`) || entry.party : null
  );
  let partyColor = $derived(
    entry?.party ? (PARTY_COLORS[entry.party] || '#888') : null
  );
  let partyLogo = $derived(
    entry?.party ? (PARTY_LOGOS[entry.party] || null) : null
  );
  let snippet = $derived(() => {
    if (entryIsIssue) return '';
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
  {#if entryIsFigure && partyLabel}
    <!-- Figure/Politician: party logo + name + party name in one row -->
    <div class="figure-header">
      {#if partyLogo}
        <img class="party-logo" src={partyLogo} alt={partyLabel} width="28" height="28" />
      {:else}
        <span class="party-dot" style="background: {partyColor}"></span>
      {/if}
      <h3 class="figure-name">{entry?.title || ''}</h3>
      <span class="figure-party" style="color: {partyColor}">{partyLabel}</span>
    </div>
    <p class="card-snippet">{snippet()}</p>
  {:else}
    <!-- Non-figure types: keep original layout -->
    <div class="card-header">
      <span class="material-symbols-outlined type-icon">{icon}</span>
      <span class="type-badge">{typeLabel}</span>
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
  {/if}
</button>

<style>
  .knowledge-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px;
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

  /* Figure/Politician header: logo + name + party in one row */
  .figure-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .party-logo {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: 2px solid var(--pr-ink);
    border-radius: 0;
  }
  .party-dot {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: 2px solid var(--pr-ink);
    border-radius: 0;
  }
  .figure-name {
    margin: 0;
    font: 900 18px var(--pr-font-sans);
    color: var(--pr-ink);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .figure-party {
    font: 900 13px var(--pr-font-sans);
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* Non-figure header */
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
