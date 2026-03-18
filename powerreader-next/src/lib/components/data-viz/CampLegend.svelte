<script>
  /**
   * CampLegend — compact legend for media camp or stance mode.
   * @prop mode {'media' | 'stance'} — which color scheme to explain
   */
  let { mode = 'media' } = $props();

  const MEDIA_ITEMS = [
    { color: 'var(--camp-green)', label: '偏綠媒體' },
    { color: 'var(--camp-white)', label: '中立媒體' },
    { color: 'var(--camp-blue)', label: '偏藍媒體' },
  ];

  const STANCE_ITEMS = [
    { gradient: 'linear-gradient(to right, var(--stance-dpp-deep), var(--stance-dpp-light))', label: '民進黨' },
    { gradient: 'linear-gradient(to right, var(--stance-tpp-deep), var(--stance-tpp-light))', label: '民眾黨' },
    { gradient: 'linear-gradient(to right, var(--stance-kmt-deep), var(--stance-kmt-light))', label: '國民黨' },
  ];

  let items = $derived(mode === 'stance' ? STANCE_ITEMS : MEDIA_ITEMS);
</script>

<div class="camp-legend" role="list" aria-label="{mode === 'stance' ? '議題立場' : '媒體陣營'}圖例">
  {#each items as item, i (i)}
    <span class="legend-item" role="listitem">
      {#if item.color}
        <span class="dot" style="background: {item.color}"></span>
      {:else}
        <span class="dot gradient" style="background-image: {item.gradient}"></span>
      {/if}
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
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.gradient {
    border-radius: 3px;
    width: 14px;
    height: 8px;
  }
</style>
