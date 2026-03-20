<script>
  let { label, selected = false, icon = '', removable = false, mode = 'chip', onclick, onremove } = $props();
</script>

{#if mode === 'tab'}
  <button class="md-tab" class:selected {onclick}>
    <span class="tab-label">{label}</span>
  </button>
{:else}
  <button class="md-chip" class:selected {onclick}>
    {#if icon}
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
    border-radius: 0;
    border: 3px solid var(--pr-ink);
    box-shadow: 2px 2px 0px var(--pr-ink);
    background: #FFFFFF;
    color: #000000;
    font: 900 14px var(--pr-font-sans);
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  }
  .md-chip:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--pr-ink);
  }
  .md-chip:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0px var(--pr-ink);
  }
  .md-chip.selected {
    background: #000000;
    color: #FFFFFF;
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
    width: 22px;
    height: 22px;
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
    background: #FFFFFF;
    color: #000000;
    font: 900 16px var(--pr-font-sans);
    cursor: pointer;
    border-bottom: 4px solid var(--pr-ink);
    transition: transform 150ms ease, background 150ms ease;
  }
  .md-tab.selected {
    background: #000000;
    color: #FFFFFF;
  }
  .md-tab:hover:not(.selected) {
    background: #F0F0F0;
  }
  .tab-label {
    position: relative;
  }
</style>
