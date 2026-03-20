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
      <button class="bar-icon-btn mobile-menu-toggle" onclick={ontoggle} aria-label="Toggle menu">
        <span class="material-symbols-outlined">menu</span>
      </button>
    {/if}
  </div>
  {#if title && title !== 'PowerReader'}
    <h1 class="bar-title">{title}</h1>
  {/if}
  <div class="bar-actions">
    {@render children?.()}
    <span class="bar-date">{dateDisplay}</span>
  </div>
</header>

<style>
  .md-top-app-bar {
    position: fixed;
    top: 0;
    left: var(--sidebar-offset, 0px);
    width: calc(100% - var(--sidebar-offset, 0px));
    height: 64px;
    background: var(--md-sys-color-surface-bright);
    display: flex;
    align-items: center;
    padding: 0 4px;
    z-index: 100;
    border-bottom: 2px solid var(--pr-ink);
    transition:
      height var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .scrolled {
    height: 48px;
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
  .mobile-menu-toggle {
    display: inline-flex;
  }
  @media (min-width: 768px) {
    .mobile-menu-toggle {
      display: none;
    }
  }
  .bar-title {
    flex: 1;
    font-family: var(--pr-font-sans);
    font-size: 26px;
    line-height: 28px;
    font-weight: 900;
    font-style: italic;
    color: var(--pr-ink);
    padding: 0 16px;
    letter-spacing: 1px;
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
    font: var(--md-sys-typescale-label-large-font);
    color: var(--pr-ink);
    font-weight: 900;
    white-space: nowrap;
    padding: 4px 16px;
    background: #E8E8E8;
    border: 2px solid var(--pr-ink);
    box-shadow: 2px 2px 0px var(--pr-ink);
    margin-right: 8px;
  }
</style>
