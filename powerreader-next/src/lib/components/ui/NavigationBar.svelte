<script>
  let { items = [], currentPath = '', onaction } = $props();

  let activeIndex = $derived(
    items.findIndex(item => item.href && item.href === currentPath)
  );
</script>

<nav class="md-navigation-bar" aria-label="Main navigation">
  {#each items as item, i}
    {#if item.action}
      <button
        class="nav-item"
        onclick={onaction}
        aria-label={item.label}
      >
        <div class="nav-icon-container">
          <span class="material-symbols-outlined nav-icon">{item.icon}</span>
        </div>
        <span class="nav-label">{item.label}</span>
      </button>
    {:else}
      <a
        href={item.href}
        class="nav-item"
        class:active={i === activeIndex}
        aria-current={i === activeIndex ? 'page' : undefined}
      >
        <div class="nav-icon-container">
          {#if i === activeIndex}
            <div class="nav-indicator"></div>
          {/if}
          <span class="material-symbols-outlined nav-icon">{item.icon}</span>
        </div>
        <span class="nav-label">{item.label}</span>
      </a>
    {/if}
  {/each}
</nav>

<style>
  .md-navigation-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    background: var(--md-sys-color-surface);
    border-top: 1px solid var(--pr-gold);
    display: flex;
    align-items: flex-start;
    justify-content: space-around;
    padding-top: 12px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 100;
  }
  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-decoration: none;
    color: var(--md-sys-color-on-surface-variant);
    min-width: 48px;
    position: relative;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .nav-item.active {
    color: var(--md-sys-color-on-surface);
  }
  .nav-icon-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 32px;
  }
  .nav-indicator {
    position: absolute;
    width: 64px;
    height: 32px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--pr-gold);
  }
  .nav-icon {
    position: relative;
    font-size: 24px;
  }
  .active .nav-icon {
    color: var(--pr-ink);
    font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
  .nav-label {
    font: var(--md-sys-typescale-label-medium-font);
  }

  /* Desktop: hide bottom navigation (sidebar takes over) */
  @media (min-width: 768px) {
    .md-navigation-bar {
      display: none;
    }
  }
</style>
