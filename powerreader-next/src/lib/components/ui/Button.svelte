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
    border: none;
    border-radius: var(--md-sys-shape-corner-small);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    text-decoration: none;
    transition: box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    position: relative;
    overflow: hidden;
  }
  .md-button::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .md-button:hover::after { opacity: var(--md-sys-state-hover-opacity); }
  .md-button:active::after { opacity: var(--md-sys-state-pressed-opacity); }
  .filled {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }
  .filled:hover { box-shadow: var(--md-sys-elevation-1); }
  .outlined {
    background: transparent;
    color: var(--md-sys-color-primary);
    border: 1px solid var(--md-sys-color-outline);
  }
  .text {
    background: transparent;
    color: var(--md-sys-color-primary);
    padding: 0 12px;
  }
  .tonal {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  .md-button:disabled, .disabled {
    opacity: 0.38;
    cursor: default;
    pointer-events: none;
  }
</style>
