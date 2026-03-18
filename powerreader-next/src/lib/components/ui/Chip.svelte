<script>
  let { label, selected = false, icon = '', removable = false, mode = 'chip', onclick, onremove } = $props();
</script>

{#if mode === 'tab'}
  <button class="md-tab" class:selected {onclick}>
    <span class="tab-label">{label}</span>
  </button>
{:else}
  <button class="md-chip" class:selected {onclick}>
    {#if selected}
      <span class="material-symbols-outlined chip-icon">check</span>
    {:else if icon}
      <span class="material-symbols-outlined chip-icon">{icon}</span>
    {/if}
    <span class="chip-label">{label}</span>
    {#if removable}
      <span
        class="chip-remove"
        role="button"
        tabindex="0"
        aria-label="Remove {label}"
        onclick={(e) => { e.stopPropagation(); onremove?.(); }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onremove?.(); } }}
      >
        <span class="material-symbols-outlined">close</span>
      </span>
    {/if}
  </button>
{/if}

<style>
  .md-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 16px;
    border-radius: var(--md-sys-shape-corner-small);
    border: 1px solid var(--md-sys-color-outline);
    background: transparent;
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .md-chip::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .md-chip:hover::after { opacity: var(--md-sys-state-hover-opacity); }
  .md-chip.selected {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    border-color: transparent;
  }
  .chip-icon {
    font-size: 18px;
  }
  .chip-label {
    position: relative;
  }
  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
    border-radius: var(--md-sys-shape-corner-full);
    font-size: 18px;
  }

  /* Tab mode */
  .md-tab {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    padding-bottom: 8px;
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color var(--md-sys-motion-duration-short4),
                border-color var(--md-sys-motion-duration-short4);
  }
  .md-tab.selected {
    color: var(--pr-ink);
    font-weight: bold;
    border-bottom: 2px solid var(--pr-gold);
  }
  .md-tab:hover:not(.selected) {
    color: var(--md-sys-color-on-surface);
  }
  .tab-label {
    position: relative;
  }
</style>
