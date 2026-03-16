<script>
  let { green = 0, white = 0, blue = 0 } = $props();
  let total = $derived(green + white + blue || 1);
  let greenPct = $derived(Math.round(green / total * 100));
  let whitePct = $derived(Math.round(white / total * 100));
  let bluePct = $derived(100 - greenPct - whitePct);
</script>

<div class="camp-bar-wrap">
  <div class="camp-bar">
    {#if greenPct > 0}
      <div class="segment green" style="width: {greenPct}%">
        {#if greenPct > 15}<span>{greenPct}%</span>{/if}
      </div>
    {/if}
    {#if whitePct > 0}
      <div class="segment white" style="width: {whitePct}%">
        {#if whitePct > 15}<span>{whitePct}%</span>{/if}
      </div>
    {/if}
    {#if bluePct > 0}
      <div class="segment blue" style="width: {bluePct}%">
        {#if bluePct > 15}<span>{bluePct}%</span>{/if}
      </div>
    {/if}
  </div>
  <div class="legend">
    <span class="legend-item"><span class="dot green"></span>偏綠</span>
    <span class="legend-item"><span class="dot white"></span>中立</span>
    <span class="legend-item"><span class="dot blue"></span>偏藍</span>
  </div>
</div>

<style>
  .camp-bar-wrap { width: 100%; }
  .camp-bar {
    display: flex;
    height: 8px;
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
  .segment.green { background: var(--camp-green); }
  .segment.white { background: var(--camp-white); }
  .segment.blue { background: var(--camp-blue); }
  .legend {
    display: flex;
    gap: 12px;
    margin-top: 4px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot.green { background: var(--camp-green); }
  .dot.white { background: var(--camp-white); }
  .dot.blue { background: var(--camp-blue); }
</style>
