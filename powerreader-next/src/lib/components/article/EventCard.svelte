<script>
  import Card from '$lib/components/ui/Card.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import ArticleCard from './ArticleCard.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';

  let {
    event = {},
    expanded = false,
    articles = [],
    articlesLoading = false,
    ontoggle,
    onArticleClick,
    onArticleAnalyze
  } = $props();

  const BLINDSPOT_LABELS = {
    white_missing: '偏白缺漏',
    green_only: '僅偏綠',
    blue_only: '僅偏藍',
    green_missing: '偏綠缺漏',
    blue_missing: '偏藍缺漏'
  };

  let blindspotLabel = $derived(
    event.blindspot_type ? (BLINDSPOT_LABELS[event.blindspot_type] || event.blindspot_type) : null
  );

  let formattedDate = $derived(() => {
    if (!event.detected_at) return '';
    const d = new Date(event.detected_at);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  let campDist = $derived(event.camp_distribution || {});
</script>

<Card variant="elevated">
  <div class="event-card">
    <button class="event-header" onclick={ontoggle}>
      <div class="header-top">
        <span class="material-symbols-outlined event-icon">hub</span>
        <h3 class="event-title">{event.title || ''}</h3>
      </div>

      <div class="event-meta">
        <span class="badge">{event.article_count ?? 0} 篇報導</span>
        <span class="badge">{event.source_count ?? 0} 來源</span>
        {#if blindspotLabel}
          <span class="blindspot-chip">{blindspotLabel}</span>
        {/if}
      </div>

      {#if campDist.green != null || campDist.white != null || campDist.blue != null}
        <div class="camp-section" onclick={(e) => e.stopPropagation()}>
          <CampBar
            green={campDist.green ?? 0}
            white={campDist.white ?? 0}
            blue={campDist.blue ?? 0}
          />
        </div>
      {/if}

      <div class="event-footer">
        <span class="date">{formattedDate()}</span>
        <span class="material-symbols-outlined expand-icon" class:rotated={expanded}>
          expand_more
        </span>
      </div>
    </button>

    {#if expanded}
      <div class="event-body">
        {#if articlesLoading}
          <div class="loading-area">
            <ProgressIndicator type="circular" />
          </div>
        {:else if articles.length > 0}
          <div class="articles-list">
            {#each articles as article (article.article_hash || article.article_id)}
              <ArticleCard
                {article}
                onclick={() => onArticleClick?.(article)}
                onanalyze={() => onArticleAnalyze?.(article)}
              />
            {/each}
          </div>
        {:else}
          <div class="empty-articles">
            <span class="material-symbols-outlined">search_off</span>
            <p>無相關文章</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</Card>

<style>
  .event-card {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .event-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .header-top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .event-icon {
    font-size: 20px;
    color: var(--md-sys-color-primary);
    flex-shrink: 0;
    margin-top: 2px;
  }
  .event-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }
  .event-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-surface-container);
  }
  .blindspot-chip {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-error);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-error-container);
  }
  .camp-section {
    width: 100%;
  }
  .event-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .date {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .expand-icon {
    font-size: 20px;
    color: var(--md-sys-color-on-surface-variant);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .expand-icon.rotated {
    transform: rotate(180deg);
  }
  .event-body {
    border-top: 1px solid var(--md-sys-color-outline-variant);
    margin-top: 8px;
    padding-top: 8px;
  }
  .articles-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .loading-area {
    display: flex;
    justify-content: center;
    padding: 16px 0;
  }
  .empty-articles {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px 0;
    color: var(--md-sys-color-on-surface-variant);
  }
  .empty-articles p {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
  }
</style>
