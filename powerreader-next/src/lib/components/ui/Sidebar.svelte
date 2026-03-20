<script>
  import { page } from '$app/state';

  let { items = [], extraItems = [], expanded = true, ontoggle, onaction } = $props();

  let currentPath = $derived(page.url.pathname);

  function isActive(href) {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }
</script>

<nav class="sidebar" class:expanded class:rail={!expanded} aria-label="Main navigation">
  <div class="sidebar-top">
    <button class="toggle-btn" onclick={ontoggle} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}>
      <span class="material-symbols-outlined">
        {expanded ? 'menu_open' : 'menu'}
      </span>
    </button>
    {#if expanded}
      <span class="sidebar-brand">PowerReader</span>
    {/if}
  </div>

  <div class="nav-items">
    {#each items as item}
      {#if item.action}
        <button
          class="nav-item action-btn"
          onclick={onaction}
          title={expanded ? undefined : item.label}
        >
          <span class="material-symbols-outlined nav-icon">{item.icon}</span>
          {#if expanded}
            <span class="nav-label">{item.label}</span>
          {/if}
        </button>
      {:else}
        <a
          href={item.href}
          class="nav-item"
          class:active={isActive(item.href)}
          aria-current={isActive(item.href) ? 'page' : undefined}
          title={expanded ? undefined : item.label}
        >
          <span class="material-symbols-outlined nav-icon">{item.icon}</span>
          {#if expanded}
            <span class="nav-label">{item.label}</span>
          {/if}
        </a>
      {/if}
    {/each}

    {#if extraItems.length > 0}
      <div class="nav-divider"></div>
      {#each extraItems as item}
        {#if item.disabled}
          <span
            class="nav-item disabled"
            title={expanded ? undefined : item.label}
            aria-disabled="true"
          >
            <span class="material-symbols-outlined nav-icon">{item.icon}</span>
            {#if expanded}
              <span class="nav-label">{item.label}</span>
              {#if item.badge}
                <span class="nav-badge">{item.badge}</span>
              {/if}
            {/if}
          </span>
        {:else}
          <a
            href={item.href}
            class="nav-item"
            class:active={isActive(item.href)}
            aria-current={isActive(item.href) ? 'page' : undefined}
            title={expanded ? undefined : item.label}
          >
            <span class="material-symbols-outlined nav-icon">{item.icon}</span>
            {#if expanded}
              <span class="nav-label">{item.label}</span>
            {/if}
          </a>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="sidebar-bottom">
    <a
      href="/settings"
      class="nav-item"
      class:active={currentPath === '/settings'}
      title={expanded ? undefined : '設定'}
    >
      <span class="material-symbols-outlined nav-icon">settings</span>
      {#if expanded}
        <span class="nav-label">設定</span>
      {/if}
    </a>
  </div>
</nav>

<style>
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    background: var(--pr-graphite);
    z-index: 100;
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized);
    overflow: hidden;
  }
  .expanded {
    width: 280px;
  }
  .rail {
    width: 72px;
  }
  .sidebar-top {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 64px;
    padding: 0 16px;
    flex-shrink: 0;
  }
  .toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    flex-shrink: 0;
  }
  .toggle-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .sidebar-brand {
    font-family: var(--pr-font-serif);
    font-size: 22px;
    line-height: 28px;
    font-weight: 400;
    color: var(--pr-gold);
    white-space: nowrap;
    overflow: hidden;
  }
  .nav-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    overflow-y: auto;
  }
  .nav-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 8px 0;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 16px;
    border-radius: var(--md-sys-shape-corner-full);
    text-decoration: none;
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    transition: background var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .nav-item.action-btn {
    border: none;
    background: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
  }
  .nav-item.disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }
  .rail .nav-item {
    justify-content: center;
    padding: 0;
  }
  .nav-item:hover:not(.disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  .nav-item.active {
    background: rgba(201, 169, 110, 0.15);
    color: #ffffff;
    border-left: 3px solid var(--pr-gold);
    border-radius: 0 var(--md-sys-shape-corner-full) var(--md-sys-shape-corner-full) 0;
  }
  .nav-icon {
    font-size: 24px;
    flex-shrink: 0;
  }
  .active .nav-icon {
    color: var(--pr-gold);
    font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
  .nav-label {
    font: var(--md-sys-typescale-label-large-font);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-badge {
    font: var(--md-sys-typescale-label-small-font);
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.6);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-full);
    margin-left: auto;
    flex-shrink: 0;
  }
  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .sidebar {
      display: none;
    }
  }
</style>
