<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import NavigationBar from '$lib/components/ui/NavigationBar.svelte';
  import TopAppBar from '$lib/components/ui/TopAppBar.svelte';
  import Sidebar from '$lib/components/ui/Sidebar.svelte';
  import Snackbar from '$lib/components/ui/Snackbar.svelte';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';
  import '../app.css';

  let { children } = $props();
  const media = getMediaQueryStore();

  const navItems = [
    { icon: 'home', label: '首頁', href: '/' },
    { icon: 'explore', label: '觀察', href: '/observe' },
    { icon: 'psychology', label: '分析', href: '/analyze' },
    { icon: 'person', label: '我的', href: '/profile' }
  ];

  const titles = {
    '/': 'PowerReader',
    '/observe': '觀察',
    '/observe/blindspot': '觀察',
    '/observe/compare': '觀察',
    '/analyze': '分析',
    '/profile': '我的',
    '/settings': '設定'
  };

  let currentPath = $derived(page.url.pathname);
  let title = $derived(titles[currentPath] || 'PowerReader');
  let showBack = $derived(
    !['/', '/observe', '/observe/blindspot', '/observe/compare', '/analyze', '/profile'].includes(currentPath)
  );
  let showNav = $derived(
    !currentPath.startsWith('/onboarding') && !currentPath.startsWith('/auth')
  );
  let isOnline = $state(true);

  $effect(() => {
    if (typeof window === 'undefined') return;

    const done = localStorage.getItem('onboarding_complete');
    if (!done && currentPath !== '/onboarding') {
      goto('/onboarding');
    }

    isOnline = navigator.onLine;
    const handleOnline = () => isOnline = true;
    const handleOffline = () => isOnline = false;
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });

  $effect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  });

  // Keyboard shortcuts
  function handleKeydown(e) {
    // Ctrl+B: toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      media.toggleSidebar();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !isOnline}
  <div class="offline-banner" class:has-sidebar={!media.isMobile}>
    <span class="material-symbols-outlined">cloud_off</span>
    離線模式
  </div>
{/if}

{#if media.isMobile}
  <!-- Mobile layout: TopAppBar + content + NavigationBar -->
  <TopAppBar {title} {showBack} onback={() => history.back()}>
    {#if currentPath === '/profile'}
      <a href="/settings" class="settings-link">
        <span class="material-symbols-outlined">settings</span>
      </a>
    {/if}
  </TopAppBar>

  <main class="page-content" class:has-nav={showNav}>
    {@render children?.()}
  </main>

  {#if showNav}
    <NavigationBar items={navItems} {currentPath} />
  {/if}
{:else}
  <!-- Desktop layout: Sidebar + TopAppBar + content -->
  {#if showNav}
    <Sidebar
      items={navItems}
      expanded={media.sidebarExpanded}
      ontoggle={media.toggleSidebar}
    />
  {/if}

  <div class="desktop-main" class:has-sidebar={showNav} class:sidebar-expanded={showNav && media.sidebarExpanded} class:sidebar-rail={showNav && !media.sidebarExpanded}>
    <TopAppBar {title} {showBack} onback={() => history.back()} showMenuToggle={showNav} ontoggle={media.toggleSidebar} />

    <main class="page-content desktop-page">
      <div class="content-wrapper">
        {@render children?.()}
      </div>
    </main>
  </div>
{/if}

<Snackbar />

<style>
  .offline-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
    font: var(--md-sys-typescale-label-large-font);
  }
  .offline-banner.has-sidebar {
    left: var(--sidebar-width-rail);
  }
  .page-content {
    padding-top: 64px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    min-height: 100vh;
  }
  .page-content.has-nav {
    padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  }
  .desktop-page {
    padding-bottom: 0;
  }
  .settings-link {
    color: var(--md-sys-color-on-surface);
    text-decoration: none;
    display: flex;
    align-items: center;
    padding: 8px;
  }

  /* Desktop layout offsets */
  .desktop-main {
    transition: margin-left var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized);
  }
  .desktop-main.sidebar-expanded {
    margin-left: 280px;
  }
  .desktop-main.sidebar-rail {
    margin-left: 72px;
  }
  .content-wrapper {
    max-width: var(--content-max-width);
    margin: 0 auto;
  }
</style>
