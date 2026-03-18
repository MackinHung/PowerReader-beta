<script>
  /**
   * CampLegend — compact legend for issue stance colors.
   * Only shows party gradient legend (no media camp classification).
   */
  const STANCE_ITEMS = [
    { gradient: 'linear-gradient(to right, var(--stance-dpp-deep), var(--stance-dpp-light))', label: '民進黨' },
    { gradient: 'linear-gradient(to right, var(--stance-tpp-deep), var(--stance-tpp-light))', label: '民眾黨' },
    { gradient: 'linear-gradient(to right, var(--stance-kmt-deep), var(--stance-kmt-light))', label: '國民黨' },
  ];
</script>

<div class="camp-legend" role="list" aria-label="議題立場圖例">
  {#each STANCE_ITEMS as item, i (i)}
    <span class="legend-item" role="listitem">
      <span class="dot gradient" style="background-image: {item.gradient}"></span>
      <span class="label">{item.label}</span>
    </span>
  {/each}
</div>

<style>
  .camp-legend {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .dot.gradient {
    border-radius: 3px;
    width: 14px;
    height: 8px;
    flex-shrink: 0;
  }
</style>
