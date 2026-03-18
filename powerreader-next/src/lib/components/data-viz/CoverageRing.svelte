<script>
  /**
   * CoverageRing — media camp distribution bar (solid colors).
   * Shows WHO reported: green/white/blue media camp proportions.
   * Missing camps rendered with diagonal hatch pattern.
   */
  let { green = 0, white = 0, blue = 0 } = $props();

  let total = $derived(green + white + blue || 1);
  let greenPct = $derived(Math.round(green / total * 100));
  let whitePct = $derived(Math.round(white / total * 100));
  let bluePct = $derived(Math.max(0, 100 - greenPct - whitePct));

  let segments = $derived([
    { key: 'green', pct: greenPct, label: '偏綠', color: 'var(--camp-green)', present: green > 0 },
    { key: 'white', pct: whitePct, label: '中立', color: 'var(--camp-white)', present: white > 0 },
    { key: 'blue', pct: bluePct, label: '偏藍', color: 'var(--camp-blue)', present: blue > 0 },
  ]);

  let missing = $derived(segments.filter(s => !s.present).map(s => s.label));
</script>

<div class="coverage-ring" role="img" aria-label="媒體陣營分佈: 偏綠 {greenPct}%, 中立 {whitePct}%, 偏藍 {bluePct}%">
  <span class="section-label">媒體陣營</span>
  <div class="bar">
    {#each segments as seg (seg.key)}
      {#if seg.pct > 0}
        <div
          class="seg"
          class:absent={!seg.present}
          style="width: {seg.pct}%; background: {seg.present ? seg.color : ''}"
        >
          {#if seg.pct > 15}
            <span class="seg-label">{seg.pct}%</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  <div class="legend">
    {#each segments as seg (seg.key)}
      {#if seg.pct > 0}
        <span class="legend-item">
          <span class="dot" class:absent={!seg.present} style="background: {seg.present ? seg.color : ''}"></span>
          {seg.label} {seg.pct}%
        </span>
      {/if}
    {/each}
  </div>
  {#if missing.length > 0}
    <span class="missing-hint">缺少{missing.join('、')}觀點</span>
  {/if}
</div>

<style>
  .coverage-ring { width: 100%; }
  .section-label {
    display: block;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-bottom: 4px;
  }
  .bar {
    display: flex;
    height: 8px;
    border-radius: var(--md-sys-shape-corner-full);
    overflow: hidden;
  }
  .seg {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }
  .seg.absent {
    background: repeating-linear-gradient(
      45deg,
      var(--md-sys-color-surface-container-high),
      var(--md-sys-color-surface-container-high) 3px,
      var(--md-sys-color-outline-variant) 3px,
      var(--md-sys-color-outline-variant) 6px
    ) !important;
  }
  .seg-label {
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
    flex-shrink: 0;
  }
  .dot.absent {
    background: repeating-linear-gradient(
      45deg,
      var(--md-sys-color-surface-container-high),
      var(--md-sys-color-surface-container-high) 2px,
      var(--md-sys-color-outline-variant) 2px,
      var(--md-sys-color-outline-variant) 4px
    ) !important;
  }
  .missing-hint {
    display: block;
    margin-top: 2px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-error);
  }
</style>
