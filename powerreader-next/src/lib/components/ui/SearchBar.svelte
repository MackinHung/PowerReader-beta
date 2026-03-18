<script>
  let { value = $bindable(''), placeholder = 'Search', onsearch } = $props();

  function handleKeydown(e) {
    if (e.key === 'Enter') onsearch?.(value);
  }

  function handleClear() {
    value = '';
  }
</script>

<div class="md-search-bar">
  <span class="material-symbols-outlined search-icon">search</span>
  <input
    class="search-input"
    type="text"
    bind:value
    {placeholder}
    onkeydown={handleKeydown}
  />
  {#if value}
    <button class="search-clear" onclick={handleClear} aria-label="Clear search">
      <span class="material-symbols-outlined">close</span>
    </button>
  {/if}
</div>

<style>
  .md-search-bar {
    display: flex;
    align-items: center;
    height: 56px;
    border-radius: var(--md-sys-shape-corner-large);
    background: var(--md-sys-color-surface-container);
    padding: 0 16px;
    gap: 8px;
    width: 100%;
  }
  .md-search-bar:focus-within {
    outline: 2px solid var(--pr-gold);
  }
  .search-icon {
    color: var(--md-sys-color-on-surface-variant);
    font-size: 24px;
    flex-shrink: 0;
  }
  .search-input {
    flex: 1;
    height: 100%;
    border: none;
    background: transparent;
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    outline: none;
  }
  .search-input::placeholder {
    color: var(--md-sys-color-on-surface-variant);
  }
  .search-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
    flex-shrink: 0;
  }
</style>
