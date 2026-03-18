<script>
  /**
   * ControversyPulse — 32px colored circle with score + pulse animation.
   * Replaces the thin ControversyHeat bar with a more visual element.
   * High scores (>60) get pulsing ring animation.
   */
  let { score = 0 } = $props();

  const LEVELS = [
    { max: 20, color: '#4CAF50', label: '低', tier: 'low' },
    { max: 40, color: '#8BC34A', label: '中低', tier: 'medium-low' },
    { max: 60, color: '#FFC107', label: '中', tier: 'medium' },
    { max: 80, color: '#FF9800', label: '中高', tier: 'high' },
    { max: 100, color: '#F44336', label: '高', tier: 'very-high' },
  ];

  let config = $derived(LEVELS.find(l => score <= l.max) || LEVELS[4]);
  let rounded = $derived(Math.round(score));
  let shouldPulse = $derived(score > 60);
  let shouldGlow = $derived(score > 80);
</script>

<div
  class="controversy-pulse"
  class:pulse={shouldPulse}
  class:glow={shouldGlow}
  role="meter"
  aria-valuenow={rounded}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="爭議度: {config.label} ({rounded})"
>
  <div class="ring" style="border-color: {config.color}; color: {config.color}">
    <span class="score">{rounded}</span>
  </div>
</div>

<style>
  .controversy-pulse {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ring {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2.5px solid;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .score {
    font: var(--md-sys-typescale-label-small-font);
    font-weight: 700;
    line-height: 1;
  }
  .pulse .ring {
    animation: pulse-ring 2s ease-out infinite;
  }
  .glow .ring {
    border-width: 3px;
  }
</style>
