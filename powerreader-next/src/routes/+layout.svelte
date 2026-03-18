<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import NavigationBar from '$lib/components/ui/NavigationBar.svelte';
  import TopAppBar from '$lib/components/ui/TopAppBar.svelte';
  import Sidebar from '$lib/components/ui/Sidebar.svelte';
  import Snackbar from '$lib/components/ui/Snackbar.svelte';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';
  import '../app.css';

  let { children } = $props();
  const media = getMediaQueryStore();

  // Lazy-load GlobalAutoRunnerBar to avoid pulling in heavy inference chain
  let AutoRunnerBar = $state(null);

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

  // Dynamic title for event detail pages
  let dynamicTitle = $derived(() => {
    if (currentPath.startsWith('/event/')) return '事件詳情';
    return null;
  });

  let currentPath = $derived(page.url.pathname);
  let title = $derived(dynamicTitle() || titles[currentPath] || 'PowerReader');
  let showBack = $derived(
    !['/', '/observe', '/observe/blindspot', '/observe/compare', '/analyze', '/profile'].includes(currentPath)
  );
  let showNav = $derived(
    !currentPath.startsWith('/onboarding') && !currentPath.startsWith('/auth')
  );
  let isOnline = $state(true);
  let pendingSyncCount = $state(0);
  let snackbarMessage = $state('');

  // Online/offline detection (no reactive deps — runs once)
  $effect(() => {
    if (typeof window === 'undefined') return;

    isOnline = navigator.onLine;
    const handleOnline = () => { isOnline = true; };
    const handleOffline = () => {
      isOnline = false;
      import('$lib/core/offline-queue.js').then(({ getPendingSyncCount }) => {
        getPendingSyncCount().then(n => { pendingSyncCount = n; });
      }).catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      import('$lib/core/offline-queue.js').then(({ getPendingSyncCount }) => {
        getPendingSyncCount().then(n => { pendingSyncCount = n; });
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });

  // SW registration + DB init (runs once, no reactive deps)
  $effect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }

    import('$lib/core/db.js').then(({ requestPersistentStorage, cleanExpiredCache }) => {
      requestPersistentStorage();
      cleanExpiredCache();
    }).catch(() => {});

    // Lazy-load auto-runner bar after initial paint
    import('$lib/components/analysis/GlobalAutoRunnerBar.svelte')
      .then(m => { AutoRunnerBar = m.default; })
      .catch(() => {});
  });

  // SW sync-complete message handler (runs once)
  $effect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    function handleSWMessage(event) {
      if (event.data?.type === 'sync-complete') {
        const { synced, failed } = event.data;
        if (synced > 0) {
          snackbarMessage = `已同步 ${synced} 筆資料${failed > 0 ? `，${failed} 筆失敗` : ''}`;
          setTimeout(() => { snackbarMessage = ''; }, 4000);
        }
        pendingSyncCount = failed;
      }
    }

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
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
    {pendingSyncCount > 0 ? `離線模式 — ${pendingSyncCount} 筆待同步` : '離線模式'}
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

{#if snackbarMessage}
  <div class="sync-snackbar">
    <span class="material-symbols-outlined">sync</span>
    {snackbarMessage}
  </div>
{/if}

{#if AutoRunnerBar}
  <svelte:component this={AutoRunnerBar} />
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
  .sync-snackbar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    border-radius: var(--md-sys-shape-corner-small);
    font: var(--md-sys-typescale-body-medium-font);
    box-shadow: var(--md-sys-elevation-3);
    animation: snackbar-in 0.3s ease-out;
  }
  @keyframes snackbar-in {
    from { transform: translateX(-50%) translateY(100%); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
</style>
