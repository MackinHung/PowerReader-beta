<script>
  let { level = 1 } = $props();

  const LEVELS = [
    { label: '低', color: '#4CAF50', icon: 'info' },
    { label: '中低', color: '#8BC34A', icon: 'info' },
    { label: '中', color: '#FFC107', icon: 'info' },
    { label: '中高', color: '#FF9800', icon: 'warning' },
    { label: '高', color: '#F44336', icon: 'warning' },
  ];

  let config = $derived(LEVELS[Math.max(0, Math.min(4, level - 1))]);
</script>

<span class="controversy-chip" style="background: {config.color}20; color: {config.color}; border-color: {config.color}40">
  <span class="material-symbols-outlined chip-icon">{config.icon}</span>
  <span class="chip-text">爭議度: {config.label}</span>
</span>

<style>
  .controversy-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--md-sys-shape-corner-small);
    border: 1px solid;
    font: var(--md-sys-typescale-label-medium-font);
    white-space: nowrap;
  }
  .chip-icon {
    font-size: 16px;
  }
  .chip-text {
    position: relative;
  }
</style>
