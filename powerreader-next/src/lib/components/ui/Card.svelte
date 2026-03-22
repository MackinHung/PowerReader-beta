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
    border-radius: 0;
    padding: 24px;
    position: relative;
    text-align: left;
    width: 100%;
    border: 4px solid var(--pr-ink);
    font: inherit;
    color: inherit;
    box-shadow: 6px 6px 0px var(--pr-ink);
    transition: transform 150ms ease, box-shadow 150ms ease;
  }
  .filled {
    background: #FFFFFF;
  }
  .elevated {
    background: #FFFFFF;
    box-shadow: 8px 8px 0px var(--pr-ink);
  }
  .editorial {
    background: #ffffff;
  }
  .dark {
    background: var(--pr-analysis-surface);
    color: var(--pr-analysis-on-surface);
    border: var(--pr-border-width) solid var(--pr-border-color);
  }
  .subtle {
    background: var(--md-sys-color-surface-container-low);
    border: 1px solid var(--md-sys-color-outline-variant);
    box-shadow: none;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    transform: translate(-4px, -4px);
    box-shadow: 10px 10px 0px var(--pr-ink);
  }
  .clickable:active {
    transform: translate(2px, 2px);
    box-shadow: 4px 4px 0px var(--pr-ink);
  }
</style>
