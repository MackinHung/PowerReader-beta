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
    border-bottom: 1px solid var(--md-sys-color-surface-container-highest);
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
    font: var(--md-sys-typescale-label-large-font);
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
    color: var(--md-sys-color-primary);
  }
  .tab-label {
    position: relative;
  }
  .tab-indicator {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 48px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--md-sys-color-primary);
  }
</style>
