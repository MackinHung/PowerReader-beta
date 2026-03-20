<script>
  let { variant = 'filled', disabled = false, href = null, onclick, children } = $props();
</script>

{#if href}
  <a {href} class="md-button {variant}" class:disabled>
    {@render children?.()}
  </a>
{:else}
  <button class="md-button {variant}" {disabled} {onclick}>
    {@render children?.()}
  </button>
{/if}

<style>
  .md-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 40px;
    padding: 0 24px;
    border: var(--pr-border-width) solid var(--pr-border-color);
    border-radius: var(--md-sys-shape-corner-small);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    text-decoration: none;
    transition: transform 100ms ease, box-shadow 100ms ease;
    position: relative;
    overflow: hidden;
  }
  /* Neo-Brutalism Action - removal of ripple, physical press effect */
  .md-button:active:not(.disabled) {
    transform: translate(4px, 4px);
    box-shadow: none !important;
  }
  .filled {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    box-shadow: var(--md-sys-elevation-1);
  }
  .outlined {
    background: var(--md-sys-color-surface-bright);
    color: var(--pr-ink);
    border: var(--pr-border-width) solid var(--pr-border-color);
    box-shadow: var(--md-sys-elevation-1);
  }
  .text {
    background: transparent;
    color: var(--pr-ink);
    padding: 0 12px;
    border-color: transparent;
  }
  .text:hover { background: rgba(0,0,0,0.05); }
  .tonal {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    box-shadow: var(--md-sys-elevation-1);
  }
  .md-button:disabled, .disabled {
    opacity: 0.38;
    cursor: default;
    pointer-events: none;
  }
</style>
