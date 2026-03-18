<script>
  /**
   * SourceDots — colored dot grid showing source distribution by camp.
   * Each source gets a row of dots (count = number of articles from that source).
   * Colors: green/white/blue following camp conventions.
   */
  let { sources = [] } = $props();

  const CAMP_COLORS = {
    green: 'var(--camp-green)',
    white: 'var(--camp-white)',
    blue: 'var(--camp-blue)',
  };

  // Show at most 5 sources, truncate rest
  let visibleSources = $derived(sources.slice(0, 5));
  let hiddenCount = $derived(Math.max(0, sources.length - 5));

  let ariaLabel = $derived(() => {
    const parts = sources.map(s => `${s.source} (${s.count}篇, ${s.camp === 'green' ? '偏綠' : s.camp === 'blue' ? '偏藍' : '中立'})`);
    return `來源分布: ${parts.join(', ')}`;
  });
</script>

<div class="source-dots" role="img" aria-label={ariaLabel()}>
  {#each visibleSources as src}
    <div class="source-row">
      <div class="dots">
        {#each Array(Math.min(src.count, 8)) as _}
          <span class="dot" style="background: {CAMP_COLORS[src.camp] || CAMP_COLORS.white}"></span>
        {/each}
        {#if src.count > 8}
          <span class="dot-overflow">+{src.count - 8}</span>
        {/if}
      </div>
      <span class="source-name">{src.source}</span>
    </div>
  {/each}
  {#if hiddenCount > 0}
    <span class="hidden-count">+{hiddenCount} 家媒體</span>
  {/if}
</div>

<style>
  .source-dots {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .source-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dots {
    display: flex;
    gap: 3px;
    align-items: center;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-overflow {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: 2px;
  }
  .source-name {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 80px;
  }
  .hidden-count {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.7;
  }
</style>
