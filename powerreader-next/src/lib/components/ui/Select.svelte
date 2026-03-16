<script>
  import { onMount } from 'svelte';

  let { options = [], value = $bindable(''), label = '' } = $props();

  let open = $state(false);
  let containerEl = $state(null);

  let selectedLabel = $derived(
    options.find(o => o.value === value)?.label ?? ''
  );

  function toggleOpen() {
    open = !open;
  }

  function select(optValue) {
    value = optValue;
    open = false;
  }

  function handleClickOutside(e) {
    if (containerEl && !containerEl.contains(e.target)) {
      open = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  });
</script>

<div class="md-select" class:open bind:this={containerEl}>
  <button class="select-trigger" class:has-value={!!value} onclick={toggleOpen}>
    {#if label}
      <span class="select-label" class:floating={!!value}>{label}</span>
    {/if}
    <span class="select-value">{selectedLabel}</span>
    <span class="material-symbols-outlined select-arrow">arrow_drop_down</span>
  </button>

  {#if open}
    <div class="select-menu" role="listbox">
      {#each options as opt}
        <button
          class="select-option"
          class:selected={opt.value === value}
          role="option"
          aria-selected={opt.value === value}
          onclick={() => select(opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .md-select {
    position: relative;
    width: 100%;
  }
  .select-trigger {
    display: flex;
    align-items: center;
    width: 100%;
    height: 56px;
    padding: 8px 16px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: transparent;
    cursor: pointer;
    position: relative;
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    text-align: left;
  }
  .open .select-trigger {
    border: 2px solid var(--md-sys-color-primary);
  }
  .select-label {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface-variant);
    pointer-events: none;
    transition: all var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    background: var(--md-sys-color-surface);
    padding: 0 4px;
  }
  .select-label.floating {
    top: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-primary);
  }
  .select-value {
    flex: 1;
    padding-top: 8px;
  }
  .select-arrow {
    color: var(--md-sys-color-on-surface-variant);
    transition: transform var(--md-sys-motion-duration-short4);
  }
  .open .select-arrow {
    transform: rotate(180deg);
  }
  .select-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--md-sys-color-surface-container);
    border-radius: var(--md-sys-shape-corner-extra-small);
    box-shadow: var(--md-sys-elevation-2);
    z-index: 200;
    max-height: 256px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .select-option {
    display: flex;
    align-items: center;
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border: none;
    background: transparent;
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
    text-align: left;
  }
  .select-option:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }
  .select-option.selected {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
</style>
