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
    background: #000000;
    color: #FFFFFF;
    border-radius: 0;
    padding: 32px;
    border: 3px solid var(--pr-analysis-border);
    box-shadow: none;
  }
  .zone-title {
    font: 900 24px/32px var(--pr-font-sans);
    color: #00E5FF; /* Cyan accent */
    margin: 0 0 24px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--pr-analysis-border);
  }
  .zone-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
