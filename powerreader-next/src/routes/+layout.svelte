<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import NavigationBar from '$lib/components/ui/NavigationBar.svelte';
  import TopAppBar from '$lib/components/ui/TopAppBar.svelte';
  import Sidebar from '$lib/components/ui/Sidebar.svelte';
  import Snackbar from '$lib/components/ui/Snackbar.svelte';
  import { goto } from '$app/navigation';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { showSnackbar } from '$lib/components/ui/Snackbar.svelte';
  import '../app.css';

  let { children } = $props();
  const media = getMediaQueryStore();
  const authStore = getAuthStore();

  // Lazy-load GlobalAutoRunnerBar to avoid pulling in heavy inference chain
  let AutoRunnerBar = $state(null);

  const navItems = [
    { icon: 'newspaper', label: '報導熱點', href: '/' },
    { icon: 'visibility', label: '觀察偏見', href: '/observe' },
    { icon: 'database', label: '資料庫', href: '/knowledge' },
    { icon: 'smart_toy', label: '自動分析', action: true },
    { icon: 'volunteer_activism', label: '個人貢獻', href: '/profile' }
  ];

  const sidebarExtraItems = [
    { icon: 'rocket_launch', label: '動力池', href: '/power-pool' },
    { icon: 'storefront', label: '點數商店', href: '', disabled: true, badge: 'Soon' }
  ];

  const titles = {
    '/': 'PowerReader',
    '/observe': '觀察偏見',
    '/observe/blindspot': '觀察偏見',
    '/observe/compare': '觀察偏見',
    '/knowledge': '資料庫',
    '/profile': '個人貢獻',
    '/power-pool': '動力池',
    '/settings': '設定'
  };

  // Dynamic title for event/knowledge detail pages
  let dynamicTitle = $derived(() => {
    if (currentPath.startsWith('/event/')) return '事件詳情';
    if (currentPath === '/knowledge/edit') return '編輯知識';
    if (currentPath === '/knowledge/review') return '編輯審核';
    if (currentPath.startsWith('/knowledge/') && currentPath !== '/knowledge') return '知識詳情';
    return null;
  });

  let currentPath = $derived(page.url.pathname);
  let title = $derived(dynamicTitle() || titles[currentPath] || 'PowerReader');
  let showBack = $derived(
    !['/', '/observe', '/observe/blindspot', '/observe/compare', '/knowledge', '/profile'].includes(currentPath)
  );
  let showNav = $derived(
    !currentPath.startsWith('/onboarding') && !currentPath.startsWith('/auth')
  );
  let isOnline = $state(true);
  let pendingSyncCount = $state(0);
  let snackbarMessage = $state('');
  let showLoginDialog = $state(false);

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

  // Pre-warm WebLLM engine if model is already cached (runs once)
  // Loads model weights from Cache API → GPU memory in background,
  // so the first analysis after page refresh is instant.
  $effect(() => {
    if (typeof window === 'undefined') return;

    untrack(() => {
      // Only pre-warm if model was previously downloaded
      if (localStorage.getItem('powerreader_webllm_cached') !== '1') return;

      // Skip mobile — uses server inference
      import('$lib/utils/device-detect.js').then(({ isMobileDevice }) => {
        if (isMobileDevice()) return;

        const prewarm = () => {
          import('$lib/core/inference.js').then(({ getWebLLMEngine }) => {
            getWebLLMEngine().catch(() => {});
          }).catch(() => {});
        };

        // Defer until browser is idle to avoid blocking initial paint
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(prewarm);
        } else {
          setTimeout(prewarm, 2000);
        }
      }).catch(() => {});
    });
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

  // Auto-analysis button handler with precondition checks
  async function handleAutoAnalysis() {
    const { getAnalysisStore } = await import('$lib/stores/analysis.svelte.js');
    const store = getAnalysisStore();

    // Already running — just expand the status bar
    if (store.isAutoRunning || store.isAutoPaused) {
      window.dispatchEvent(new CustomEvent('pr:expand-auto-bar'));
      return;
    }

    // Check: mobile device
    const { isMobileDevice } = await import('$lib/utils/device-detect.js');
    if (isMobileDevice()) {
      showSnackbar('行動裝置不支援自動分析，請使用電腦');
      return;
    }

    // Check: WebGPU
    const { hasWebGPU } = await import('$lib/core/inference.js');
    if (!await hasWebGPU()) {
      showSnackbar('您的瀏覽器不支援 WebGPU，無法執行本地分析');
      return;
    }

    // Check: auth
    if (!authStore.isAuthenticated) {
      showLoginDialog = true;
      return;
    }

    // Check: model downloaded
    if (localStorage.getItem('powerreader_webllm_cached') !== '1') {
      showSnackbar('請先下載 AI 模型', {
        action: { label: '前往設定', onclick: () => goto('/settings') }
      });
      return;
    }

    // All checks passed — start
    await store.startAuto();
  }

  function handleLoginRedirect() {
    const apiOrigin = 'https://powerreader-api.watermelom5404.workers.dev';
    const callbackUrl = `${window.location.origin}/auth/callback`;
    window.location.href = `${apiOrigin}/api/v1/auth/google?redirect=${encodeURIComponent(callbackUrl)}`;
  }

  // Keyboard shortcuts
  function handleKeydown(e) {
    // Ctrl+B: toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      media.toggleSidebar();
    }
  }
</script>

<svelte:head>
  <title>PowerReader - 台灣新聞立場分析</title>
</svelte:head>

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
    <NavigationBar items={navItems} {currentPath} onaction={handleAutoAnalysis} />
  {/if}
{:else}
  <!-- Desktop layout: Sidebar + TopAppBar + content -->
  {#if showNav}
    <Sidebar
      items={navItems}
      extraItems={sidebarExtraItems}
      expanded={media.sidebarExpanded}
      ontoggle={media.toggleSidebar}
      onaction={handleAutoAnalysis}
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

{#if showLoginDialog}
  <div class="login-dialog-backdrop" onclick={() => showLoginDialog = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="login-dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <span class="material-symbols-outlined login-dialog-icon">login</span>
      <h3 class="login-dialog-title">請先登入</h3>
      <p class="login-dialog-text">登入後才能使用自動分析功能</p>
      <div class="login-dialog-actions">
        <button class="login-dialog-btn primary" onclick={handleLoginRedirect}>
          <span class="material-symbols-outlined">account_circle</span>
          使用 Google 登入
        </button>
        <button class="login-dialog-btn text" onclick={() => showLoginDialog = false}>
          稍後再說
        </button>
      </div>
    </div>
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
  /* Login dialog */
  .login-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-dialog {
    background: var(--md-sys-color-surface-container-high);
    border-radius: var(--md-sys-shape-corner-large);
    padding: 24px;
    max-width: 360px;
    width: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
  }
  .login-dialog-icon {
    font-size: 40px;
    color: var(--md-sys-color-primary);
  }
  .login-dialog-title {
    margin: 0;
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
  }
  .login-dialog-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .login-dialog-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    margin-top: 8px;
  }
  .login-dialog-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    cursor: pointer;
    font: var(--md-sys-typescale-label-large-font);
    padding: 12px 24px;
  }
  .login-dialog-btn.primary {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }
  .login-dialog-btn.primary:hover {
    box-shadow: var(--md-sys-elevation-1);
  }
  .login-dialog-btn.text {
    background: transparent;
    color: var(--md-sys-color-primary);
  }
  .login-dialog-btn.text:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  }
</style>
