<script>
  let { items = [], active = $bindable('') } = $props();

  function handleClick(value) {
    active = value;
  }
</script>

<div class="md-tabs" role="tablist">
  {#each items as item}
    <button
      class="md-tab"
      class:active={item.value === active}
      role="tab"
      aria-selected={item.value === active}
      onclick={() => handleClick(item.value)}
    >
      <span class="tab-label">{item.label}</span>
      {#if item.value === active}
        <div class="tab-indicator"></div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .md-tabs {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 4px solid var(--pr-ink);
  }
  .md-tabs::-webkit-scrollbar { display: none; }
  .md-tab {
    flex: 1;
    min-width: fit-content;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    font: 900 16px var(--pr-font-sans);
    cursor: pointer;
    padding: 0 16px;
    white-space: nowrap;
  }
  .md-tab::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .md-tab:hover::after { opacity: var(--md-sys-state-hover-opacity); }
  .md-tab.active {
    background: #000000;
    color: #FFFFFF;
  }
  .tab-label {
    position: relative;
  }
  .tab-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 4px;
    border-radius: 0;
    background: var(--pr-ink);
  }
</style>
