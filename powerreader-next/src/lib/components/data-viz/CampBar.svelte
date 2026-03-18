<script>
  /**
   * CampBar — proportional horizontal bar.
   * mode='media': solid camp colors (WHO reported)
   * mode='stance': gradient party colors (WHAT it says)
   */
  let { green = 0, white = 0, blue = 0, mode = 'media' } = $props();

  let total = $derived(green + white + blue || 1);
  let greenPct = $derived(Math.round(green / total * 100));
  let whitePct = $derived(Math.round(white / total * 100));
  let bluePct = $derived(100 - greenPct - whitePct);

  const MEDIA_CONFIG = {
    green: { bg: 'var(--camp-green)', label: '偏綠' },
    white: { bg: 'var(--camp-white)', label: '中立' },
    blue: { bg: 'var(--camp-blue)', label: '偏藍' },
  };

  const STANCE_CONFIG = {
    green: { bg: 'linear-gradient(to right, var(--stance-dpp-deep), var(--stance-dpp-light))', label: '民進黨' },
    white: { bg: 'linear-gradient(to right, var(--stance-tpp-deep), var(--stance-tpp-light))', label: '民眾黨' },
    blue: { bg: 'linear-gradient(to right, var(--stance-kmt-deep), var(--stance-kmt-light))', label: '國民黨' },
  };

  let cfg = $derived(mode === 'stance' ? STANCE_CONFIG : MEDIA_CONFIG);
  let isStance = $derived(mode === 'stance');
</script>

<div class="camp-bar-wrap">
  <div class="camp-bar" class:stance={isStance}>
    {#if greenPct > 0}
      <div
        class="segment"
        style="width: {greenPct}%; {isStance ? `background-image: ${cfg.green.bg}` : `background: ${cfg.green.bg}`}"
      >
        {#if greenPct > 15}<span>{greenPct}%</span>{/if}
      </div>
    {/if}
    {#if whitePct > 0}
      <div
        class="segment"
        style="width: {whitePct}%; {isStance ? `background-image: ${cfg.white.bg}` : `background: ${cfg.white.bg}`}"
      >
        {#if whitePct > 15}<span>{whitePct}%</span>{/if}
      </div>
    {/if}
    {#if bluePct > 0}
      <div
        class="segment"
        style="width: {bluePct}%; {isStance ? `background-image: ${cfg.blue.bg}` : `background: ${cfg.blue.bg}`}"
      >
        {#if bluePct > 15}<span>{bluePct}%</span>{/if}
      </div>
    {/if}
  </div>
  <div class="legend">
    <span class="legend-item"><span class="dot" style="{isStance ? `background-image: ${cfg.green.bg}` : `background: ${cfg.green.bg}`}"></span>{cfg.green.label}</span>
    <span class="legend-item"><span class="dot" style="{isStance ? `background-image: ${cfg.white.bg}` : `background: ${cfg.white.bg}`}"></span>{cfg.white.label}</span>
    <span class="legend-item"><span class="dot" style="{isStance ? `background-image: ${cfg.blue.bg}` : `background: ${cfg.blue.bg}`}"></span>{cfg.blue.label}</span>
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
  .camp-bar.stance {
    height: 12px;
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
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .camp-bar.stance + .legend .dot {
    border-radius: 2px;
    width: 12px;
    height: 6px;
  }
</style>
