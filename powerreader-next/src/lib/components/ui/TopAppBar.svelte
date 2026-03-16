<script>
  import { onMount } from 'svelte';

  let { title = '', showBack = false, onback, children } = $props();
  let scrolled = $state(false);

  onMount(() => {
    function handleScroll() {
      scrolled = window.scrollY > 0;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });
</script>

<header class="md-top-app-bar" class:scrolled>
  <div class="bar-leading">
    {#if showBack}
      <button class="bar-back" onclick={onback} aria-label="Go back">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
    {/if}
  </div>
  <h1 class="bar-title">{title}</h1>
  <div class="bar-actions">
    {@render children?.()}
  </div>
</header>

<style>
  .md-top-app-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 64px;
    background: var(--md-sys-color-surface);
    display: flex;
    align-items: center;
    padding: 0 4px;
    z-index: 100;
    transition: box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .scrolled {
    box-shadow: var(--md-sys-elevation-2);
  }
  .bar-leading {
    display: flex;
    align-items: center;
  }
  .bar-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
  }
  .bar-title {
    flex: 1;
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
    padding: 0 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
  }
</style>
