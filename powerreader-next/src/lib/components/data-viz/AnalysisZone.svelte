<script>
  let { title = '', children } = $props();
</script>

<div class="analysis-zone">
  {#if title}
    <h3 class="zone-title">{title}</h3>
  {/if}
  <div class="zone-content">
    {@render children?.()}
  </div>
</div>

<style>
  .analysis-zone {
    background: var(--pr-analysis-surface);
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 20px;
    border: 1px solid var(--pr-analysis-border);
  }
  .zone-title {
    font: 700 18px/24px var(--pr-font-serif);
    color: var(--pr-analysis-gold);
    margin: 0 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--pr-analysis-border);
  }
  .zone-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
