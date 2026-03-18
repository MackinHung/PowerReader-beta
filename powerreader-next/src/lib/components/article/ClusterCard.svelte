<script>
  /**
   * ClusterCard — data-driven visual card for a news event cluster.
   * Displays: title, camp bar, source dots, controversy heat, timeline.
   * Click navigates to cluster detail page.
   */
  import Card from '$lib/components/ui/Card.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import SourceDots from '$lib/components/data-viz/SourceDots.svelte';
  import ControversyHeat from '$lib/components/data-viz/ControversyHeat.svelte';
  import ClusterTimeline from '$lib/components/data-viz/ClusterTimeline.svelte';

  let { cluster = {}, onclick } = $props();

  const BLINDSPOT_LABELS = {
    green_only: '僅綠營報導',
    blue_only: '僅藍營報導',
    white_missing: '缺乏中立報導',
    imbalanced: '報導失衡',
  };

  let campDist = $derived(
    typeof cluster.camp_distribution === 'string'
      ? JSON.parse(cluster.camp_distribution || '{}')
      : (cluster.camp_distribution || {})
  );

  let sources = $derived(
    typeof cluster.sources_json === 'string'
      ? JSON.parse(cluster.sources_json || '[]')
      : (cluster.sources_json || [])
  );

  let blindspotLabel = $derived(
    cluster.blindspot_type ? (BLINDSPOT_LABELS[cluster.blindspot_type] || cluster.blindspot_type) : null
  );

  let blindspotClass = $derived(() => {
    if (!cluster.is_blindspot) return '';
    const t = cluster.blindspot_type;
    if (t === 'green_only') return 'blindspot-green';
    if (t === 'blue_only') return 'blindspot-blue';
    return 'blindspot-imbalanced';
  });

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.();
    }
  }
</script>

<div
  class="cluster-card-wrapper {blindspotClass()}"
  onclick={onclick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-label="事件: {cluster.representative_title ?? ''}, {cluster.article_count ?? 0} 篇報導"
>
  <Card variant="elevated">
    <div class="cluster-inner">
      <!-- Header: badges -->
      <div class="cluster-header">
        <div class="header-badges">
          {#if cluster.category}
            <span class="category-badge">{cluster.category}</span>
          {/if}
          {#if blindspotLabel}
            <span class="blindspot-badge">{blindspotLabel}</span>
          {/if}
        </div>
        <span class="meta-badge">{cluster.article_count ?? 0} 篇 · {cluster.source_count ?? 0} 家媒體</span>
      </div>

      <!-- Title -->
      <h3 class="cluster-title">{cluster.representative_title ?? ''}</h3>

      <!-- Camp Bar -->
      {#if campDist.green != null || campDist.white != null || campDist.blue != null}
        <div class="camp-section">
          <CampBar
            green={campDist.green ?? 0}
            white={campDist.white ?? 0}
            blue={campDist.blue ?? 0}
          />
        </div>
      {/if}

      <!-- Source Dots -->
      {#if sources.length > 0}
        <div class="sources-section">
          <SourceDots {sources} />
        </div>
      {/if}

      <!-- Footer: controversy + timeline -->
      <div class="cluster-footer">
        {#if cluster.avg_controversy_score != null}
          <div class="heat-section">
            <ControversyHeat score={cluster.avg_controversy_score} />
          </div>
        {/if}
        <ClusterTimeline
          earliest={cluster.earliest_published_at}
          latest={cluster.latest_published_at}
        />
      </div>
    </div>
  </Card>
</div>

<style>
  .cluster-card-wrapper {
    display: block;
    cursor: pointer;
    border-radius: var(--md-sys-shape-corner-medium);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .cluster-card-wrapper:hover {
    transform: translateY(-2px);
  }
  .cluster-card-wrapper:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }

  /* Blindspot left border accents */
  .cluster-card-wrapper.blindspot-green {
    border-left: 3px solid var(--camp-green);
  }
  .cluster-card-wrapper.blindspot-blue {
    border-left: 3px solid var(--camp-blue);
  }
  .cluster-card-wrapper.blindspot-imbalanced {
    border-left: 3px solid var(--md-sys-color-error);
  }

  .cluster-inner {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Header */
  .cluster-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .header-badges {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .category-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-tertiary-container);
    background: var(--md-sys-color-tertiary-container);
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .blindspot-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-error);
    background: var(--md-sys-color-error-container);
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .meta-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
  }

  /* Title */
  .cluster-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }

  /* Sections */
  .camp-section {
    width: 100%;
  }
  .sources-section {
    padding: 2px 0;
  }

  /* Footer */
  .cluster-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
  .heat-section {
    width: 100%;
  }
</style>
