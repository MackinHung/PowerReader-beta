<script>
  import { onMount } from 'svelte';

  let { title = '', showBack = false, onback, showMenuToggle = false, ontoggle, children } = $props();
  let scrolled = $state(false);

  // Compute current date string in "2026年3月18日 週三" format
  const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  let dateDisplay = $derived.by(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const w = WEEKDAYS[now.getDay()];
    return `${y}年${m}月${d}日 ${w}`;
  });

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
      <button class="bar-icon-btn" onclick={onback} aria-label="Go back">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
    {:else if showMenuToggle}
      <button class="bar-icon-btn desktop-menu-toggle" onclick={ontoggle} aria-label="Toggle sidebar">
        <span class="material-symbols-outlined">menu</span>
      </button>
    {/if}
  </div>
  <h1 class="bar-title">{title}</h1>
  <div class="bar-actions">
    {@render children?.()}
    <span class="bar-date">{dateDisplay}</span>
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
    border-bottom: 1px solid transparent;
    transition:
      height var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
      border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .scrolled {
    height: 48px;
    border-bottom: 1px solid var(--pr-gold);
  }
  .bar-leading {
    display: flex;
    align-items: center;
  }
  .bar-icon-btn {
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
  .bar-icon-btn:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }
  /* Hide menu toggle on mobile (sidebar is hidden there) */
  .desktop-menu-toggle {
    display: none;
  }
  @media (min-width: 768px) {
    .desktop-menu-toggle {
      display: inline-flex;
    }
  }
  .bar-title {
    flex: 1;
    font-family: var(--pr-font-serif);
    font-size: 22px;
    line-height: 28px;
    font-weight: 400;
    color: var(--pr-gold);
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
  .bar-date {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    padding: 0 8px;
  }
</style>
