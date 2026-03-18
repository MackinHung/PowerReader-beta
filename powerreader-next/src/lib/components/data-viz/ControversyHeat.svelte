<script>
  /**
   * ControversyHeat — thin horizontal color bar showing controversy score.
   * Width proportional to score (0-100), color follows 5-level scale.
   */
  let { score = 0 } = $props();

  const LEVELS = [
    { max: 20, color: '#4CAF50', label: '低' },
    { max: 40, color: '#8BC34A', label: '中低' },
    { max: 60, color: '#FFC107', label: '中' },
    { max: 80, color: '#FF9800', label: '中高' },
    { max: 100, color: '#F44336', label: '高' },
  ];

  let config = $derived(LEVELS.find(l => score <= l.max) || LEVELS[4]);
</script>

<div class="controversy-heat" role="meter" aria-valuenow={score} aria-valuemin="0" aria-valuemax="100" aria-label="爭議度: {config.label} ({Math.round(score)})">
  <div class="heat-track">
    <div class="heat-fill" style="width: {score}%; background: {config.color}"></div>
  </div>
  <span class="heat-label" style="color: {config.color}">{config.label}</span>
</div>

<style>
  .controversy-heat {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .heat-track {
    flex: 1;
    height: 6px;
    background: var(--md-sys-color-surface-container-high);
    border-radius: var(--md-sys-shape-corner-full);
    overflow: hidden;
  }
  .heat-fill {
    height: 100%;
    border-radius: var(--md-sys-shape-corner-full);
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }
  .heat-label {
    font: var(--md-sys-typescale-label-small-font);
    white-space: nowrap;
    min-width: 24px;
  }
</style>
