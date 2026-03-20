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
    border-radius: 0;
    font: 900 16px var(--pr-font-sans);
    cursor: pointer;
    text-decoration: none;
    transition: transform 100ms ease, box-shadow 100ms ease;
    box-shadow: 4px 4px 0px var(--pr-ink);
  }
  .md-button:hover:not(.disabled) {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0px var(--pr-ink);
  }
  .md-button:active:not(.disabled) {
    transform: translate(4px, 4px);
    box-shadow: 0px 0px 0px var(--pr-ink) !important;
  }
  .filled {
    background: #000000;
    color: #FFFFFF;
  }
  .outlined {
    background: #FFFFFF;
    color: #000000;
  }
  .text {
    background: transparent;
    color: #000000;
    box-shadow: none;
    border-color: transparent;
  }
  .text:hover:not(.disabled) {
    background: #F0F0F0;
    box-shadow: none;
    transform: none;
  }
  .tonal {
    background: #F3F3F3;
    color: #000000;
  }
  .md-button:disabled, .disabled {
    opacity: 0.38;
    cursor: default;
    pointer-events: none;
  }
</style>
