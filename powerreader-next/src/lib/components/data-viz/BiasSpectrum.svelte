<script>
  let { score = 0 } = $props();

  const SEGMENTS = [
    { value: -3, label: '極綠', color: '#1B5E20' },
    { value: -2, label: '偏綠', color: '#2E7D32' },
    { value: -1, label: '略綠', color: '#66BB6A' },
    { value: 0, label: '中立', color: '#9E9E9E' },
    { value: 1, label: '略藍', color: '#42A5F5' },
    { value: 2, label: '偏藍', color: '#1565C0' },
    { value: 3, label: '極藍', color: '#0D47A1' },
  ];

  let clampedScore = $derived(Math.max(-3, Math.min(3, score)));
  let indicatorPct = $derived(((clampedScore + 3) / 6) * 100);
  let activeSegment = $derived(
    SEGMENTS.find((s) => s.value === Math.round(clampedScore)) ?? SEGMENTS[3]
  );
</script>

<div class="bias-spectrum">
  <div class="bar">
    {#each SEGMENTS as seg}
      <div
        class="seg"
        class:active={seg.value === Math.round(clampedScore)}
        style="background: {seg.color}"
      ></div>
    {/each}
    <div class="indicator" style="left: {indicatorPct}%">
      <div class="indicator-dot" style="background: {activeSegment.color}"></div>
    </div>
  </div>
  <span class="label" style="color: {activeSegment.color}">{activeSegment.label}</span>
</div>

<style>
  .bias-spectrum {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bar {
    position: relative;
    display: flex;
    height: 12px;
    border-radius: var(--md-sys-shape-corner-full);
    overflow: visible;
  }
  .seg {
    flex: 1;
    opacity: 0.6;
    transition: opacity var(--md-sys-motion-duration-short4);
  }
  .seg:first-child {
    border-radius: var(--md-sys-shape-corner-full) 0 0 var(--md-sys-shape-corner-full);
  }
  .seg:last-child {
    border-radius: 0 var(--md-sys-shape-corner-full) var(--md-sys-shape-corner-full) 0;
  }
  .seg.active {
    opacity: 1;
  }
  .indicator {
    position: absolute;
    top: 100%;
    transform: translateX(-50%);
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .indicator-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--md-sys-color-surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .label {
    font: var(--md-sys-typescale-label-small-font);
    text-align: center;
    margin-top: 10px;
  }
</style>
