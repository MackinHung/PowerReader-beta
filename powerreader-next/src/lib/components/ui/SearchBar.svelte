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
    height: 72px; /* Large input */
    border-radius: 0;
    background: var(--md-sys-color-surface-bright);
    padding: 0 24px;
    gap: 16px;
    width: 100%;
    border: 4px solid var(--pr-ink);
    box-shadow: 8px 8px 0px var(--pr-ink);
    transition: transform 100ms ease, box-shadow 100ms ease;
  }
  .md-search-bar:focus-within {
    transform: translate(4px, 4px);
    box-shadow: 4px 4px 0px var(--pr-ink);
    outline: none;
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
    font: 700 20px/28px var(--pr-font-sans); /* text-xl font-bold */
    color: var(--pr-ink);
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
