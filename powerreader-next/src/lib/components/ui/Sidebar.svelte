<script>
  import { page } from '$app/state';

  let { items = [], expanded = true, ontoggle } = $props();

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
    {/each}
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
    background: var(--md-sys-color-surface-container);
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
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
    flex-shrink: 0;
  }
  .toggle-btn:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }
  .sidebar-brand {
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
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
  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 16px;
    border-radius: var(--md-sys-shape-corner-full);
    text-decoration: none;
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    transition: background var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .rail .nav-item {
    justify-content: center;
    padding: 0;
  }
  .nav-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }
  .nav-item.active {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  .nav-icon {
    font-size: 24px;
    flex-shrink: 0;
  }
  .active .nav-icon {
    font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
  .nav-label {
    font: var(--md-sys-typescale-label-large-font);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .sidebar {
      display: none;
    }
  }
</style>
