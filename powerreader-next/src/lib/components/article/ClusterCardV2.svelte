<script>
  /**
   * ClusterCardV2 — redesigned cluster card.
   * Media sources shown as neutral brand icons (no camp coloring).
   * Issue stance shown via StancePrism (AI-analyzed, not pre-labeled).
   *
   * Visual states:
   *   - Hot:   warm glow shadow + ControversyPulse animation
   *   - Calm:  flat, balanced colors
   */
  import Card from '$lib/components/ui/Card.svelte';
  import ControversyPulse from '$lib/components/data-viz/ControversyPulse.svelte';
  import StancePrism from '$lib/components/data-viz/StancePrism.svelte';
  import SourceBadge from './SourceBadge.svelte';
  import ClusterTimeline from '$lib/components/data-viz/ClusterTimeline.svelte';

  let { cluster = {}, onclick } = $props();

  function safeJsonParse(str, fallback) {
    if (typeof str !== 'string') return str || fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  let sources = $derived(safeJsonParse(cluster.sources_json, []));
  let avgCampRatio = $derived(safeJsonParse(cluster.avg_camp_ratio, null));

  let controversy = $derived(cluster.avg_controversy_score ?? 0);
  let isHot = $derived(controversy > 60);

  // Compact source list (max 5 for inline display)
  let compactSources = $derived(() => {
    const s = sources.slice(0, 5);
    return s.map(item => (typeof item === 'string' ? item : item.source));
  });
  let extraSourceCount = $derived(Math.max(0, sources.length - 5));

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.();
    }
  }
</script>

<div
  class="cluster-v2-wrapper"
  class:hot={isHot}
  onclick={onclick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-label="事件: {cluster.representative_title ?? ''}, {cluster.article_count ?? 0} 篇報導"
>
  <Card variant="editorial">
    <div class="v2-inner">
      <!-- Header -->
      <div class="v2-header">
        <div class="header-left">
          {#if cluster.category}
            <span class="category-chip">{cluster.category}</span>
          {/if}
          <span class="meta">{cluster.article_count ?? 0} 篇 · {cluster.source_count ?? 0} 家媒體</span>
        </div>
        {#if controversy > 0}
          <ControversyPulse score={controversy} />
        {/if}
      </div>

      <!-- Title -->
      <h3 class="v2-title">{cluster.representative_title ?? ''}</h3>

      <!-- Source Badges (compact inline) -->
      {#if compactSources().length > 0}
        <div class="source-row">
          {#each compactSources() as src (src)}
            <SourceBadge source={src} size="small" />
          {/each}
          {#if extraSourceCount > 0}
            <span class="extra-sources">+{extraSourceCount}</span>
          {/if}
        </div>
      {/if}

      <!-- Issue Stance (collapsible) -->
      <div class="stance-section">
        <StancePrism
          {avgCampRatio}
          analyzedCount={cluster.analyzed_count ?? 0}
          totalCount={cluster.article_count ?? 0}
        />
      </div>

      <!-- Footer: Timeline -->
      <div class="v2-footer">
        <ClusterTimeline
          earliest={cluster.earliest_published_at}
          latest={cluster.latest_published_at}
        />
      </div>
    </div>
  </Card>
</div>

<style>
  .cluster-v2-wrapper {
    display: block;
    cursor: pointer;
    border-radius: var(--md-sys-shape-corner-medium);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .cluster-v2-wrapper:hover {
    transform: translateY(-3px);
  }
  .cluster-v2-wrapper:hover :global(.editorial) {
    border-left-width: 4px;
  }
  .cluster-v2-wrapper:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }

  /* Hot state: warm glow shadow */
  .cluster-v2-wrapper.hot {
    animation: glow-warm 3s ease-in-out infinite;
  }

  .v2-inner {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Header */
  .v2-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .category-chip {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-primary-container);
    background: var(--md-sys-color-primary-container);
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    white-space: nowrap;
  }
  .meta {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
  }

  /* Title */
  .v2-title {
    font-family: var(--pr-font-serif);
    font-size: 16px;
    font-weight: 500;
    color: var(--md-sys-color-on-surface);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }

  /* Source row */
  .source-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .extra-sources {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Sections */
  .stance-section {
    width: 100%;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding-top: 4px;
  }

  /* Footer */
  .v2-footer {
    padding-top: 4px;
    color: var(--md-sys-color-primary);
    font: var(--md-sys-typescale-label-small-font);
  }
</style>
