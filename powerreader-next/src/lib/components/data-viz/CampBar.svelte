<script>
  /**
   * CampBar — proportional horizontal bar for issue stance (AI-analyzed).
   * Shows party gradient colors: DPP (green), TPP (white), KMT (blue).
   * No media camp classification — only AI-derived stance ratios.
   */
  let { green = 0, white = 0, blue = 0 } = $props();

  let total = $derived(green + white + blue || 1);
  let greenPct = $derived(Math.round(green / total * 100));
  let whitePct = $derived(Math.round(white / total * 100));
  let bluePct = $derived(100 - greenPct - whitePct);

  const CFG = {
    green: { bg: 'linear-gradient(to right, var(--stance-dpp-deep), var(--stance-dpp-light))', label: '民進黨' },
    white: { bg: 'linear-gradient(to right, var(--stance-tpp-deep), var(--stance-tpp-light))', label: '民眾黨' },
    blue: { bg: 'linear-gradient(to right, var(--stance-kmt-deep), var(--stance-kmt-light))', label: '國民黨' },
  };
</script>

<div class="camp-bar-wrap">
  <div class="camp-bar">
    {#if greenPct > 0}
      <div class="segment" style="width: {greenPct}%; background-image: {CFG.green.bg}">
        {#if greenPct > 15}<span>{greenPct}%</span>{/if}
      </div>
    {/if}
    {#if whitePct > 0}
      <div class="segment" style="width: {whitePct}%; background-image: {CFG.white.bg}">
        {#if whitePct > 15}<span>{whitePct}%</span>{/if}
      </div>
    {/if}
    {#if bluePct > 0}
      <div class="segment" style="width: {bluePct}%; background-image: {CFG.blue.bg}">
        {#if bluePct > 15}<span>{bluePct}%</span>{/if}
      </div>
    {/if}
  </div>
  <div class="legend">
    <span class="legend-item"><span class="dot" style="background-image: {CFG.green.bg}"></span>{CFG.green.label}</span>
    <span class="legend-item"><span class="dot" style="background-image: {CFG.white.bg}"></span>{CFG.white.label}</span>
    <span class="legend-item"><span class="dot" style="background-image: {CFG.blue.bg}"></span>{CFG.blue.label}</span>
  </div>
</div>

<style>
  .camp-bar-wrap { width: 100%; }
  .camp-bar {
    display: flex;
    height: 12px;
    border-radius: var(--md-sys-shape-corner-full);
    overflow: hidden;
  }
  .segment {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }
  .segment span {
    font: var(--md-sys-typescale-label-small-font);
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }
  .legend {
    display: flex;
    gap: 12px;
    margin-top: 4px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .dot {
    width: 12px;
    height: 6px;
    border-radius: 2px;
  }
</style>
