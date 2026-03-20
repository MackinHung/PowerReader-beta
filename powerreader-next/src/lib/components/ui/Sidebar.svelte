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
  <div class="sidebar-top" class:expanded>
    <button class="toggle-btn" onclick={ontoggle} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}>
      <span class="material-symbols-outlined">
        {expanded ? 'keyboard_double_arrow_left' : 'keyboard_double_arrow_right'}
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
    background: #000000;
    border-right: 4px solid var(--pr-ink);
    z-index: 200;
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
    gap: 8px;
    height: 64px;
    padding: 0 12px;
    flex-shrink: 0;
    background: #FF5722;
    border-bottom: 2px solid var(--pr-ink);
  }
  .sidebar-top.expanded {
    justify-content: flex-start;
  }
  .sidebar-top:not(.expanded) {
    justify-content: center;
  }
  .toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #FFFFFF;
    cursor: pointer;
    flex-shrink: 0;
  }
  .toggle-btn:hover {
    background: rgba(0, 0, 0, 0.2);
  }
  .sidebar-brand {
    font-family: var(--pr-font-sans);
    font-size: 28px;
    line-height: 32px;
    font-weight: 900;
    font-style: italic;
    color: var(--pr-ink);
    letter-spacing: -0.5px;
    white-space: nowrap;
  }
  .nav-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .nav-items::-webkit-scrollbar {
    display: none;
  }
  .nav-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 8px 24px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 24px;
    border-radius: 0;
    text-decoration: none;
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    font-weight: 900;
    font-size: 22px;
    font-style: italic;
    letter-spacing: 1px;
    border-left: 8px solid transparent;
    transition: all 150ms ease;
  }
  .nav-item.action-btn {
    border-left: 8px solid transparent;
    background: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
    border-top: none;
    border-right: none;
    border-bottom: none;
  }
  .nav-item.disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }
  .rail .nav-item {
    justify-content: center;
    padding: 16px 0;
    gap: 0;
    border-left: 4px solid transparent;
  }
  .nav-item:hover:not(.disabled):not(.active) {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
    border-left-color: #FF5722;
  }
  .nav-item.active {
    background: #FFFFFF;
    color: #000000;
    border-left: 8px solid #FF5722;
  }
  .rail .nav-item.active {
    border-left: 4px solid #FF5722;
  }
  .nav-icon {
    font-size: 24px;
    flex-shrink: 0;
  }
  .active .nav-icon {
    color: #000000;
    font-variation-settings: 'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24;
  }
  .nav-label {
    font: var(--md-sys-typescale-label-large-font);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-badge {
    font: var(--md-sys-typescale-label-small-font);
    background: #000000;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 0;
    margin-left: auto;
    flex-shrink: 0;
  }
  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    padding: 0;
    border-top: 2px solid rgba(255, 255, 255, 0.1);
    background: #000000;
    flex-shrink: 0;
  }
  .sidebar-bottom .nav-item {
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    border-left: 8px solid transparent;
  }
  .sidebar-bottom .nav-item:hover:not(.active) {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
    border-left-color: #FF5722;
  }

  @media (max-width: 767px) {
    .sidebar {
      display: none;
    }
  }
</style>
