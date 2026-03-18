<script>
  let { variant = 'filled', clickable = false, onclick, children } = $props();
</script>

{#if clickable}
  <button class="md-card {variant} clickable" {onclick}>
    {@render children?.()}
  </button>
{:else}
  <div class="md-card {variant}">
    {@render children?.()}
  </div>
{/if}

<style>
  .md-card {
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 12px;
    position: relative;
    overflow: hidden;
    text-align: left;
    width: 100%;
    border: none;
    font: inherit;
    color: inherit;
  }
  .md-card::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .filled {
    background: var(--md-sys-color-surface-container-lowest);
    box-shadow: none;
  }
  .elevated {
    background: var(--md-sys-color-surface);
    box-shadow: var(--md-sys-elevation-1);
  }
  .editorial {
    background: #ffffff;
    border-left: 3px solid var(--pr-gold);
    box-shadow: none;
  }
  .dark {
    background: var(--pr-analysis-surface);
    color: var(--pr-analysis-on-surface);
    border: 1px solid var(--pr-analysis-border);
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover::after { opacity: var(--md-sys-state-hover-opacity); }
  .clickable:active::after { opacity: var(--md-sys-state-pressed-opacity); }
</style>
