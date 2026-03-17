<script>
  import { getAnalysisStore } from '$lib/stores/analysis.svelte.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';

  const analysis = getAnalysisStore();
  const media = getMediaQueryStore();

  let minimized = $state(false);
  let showGpuToast = $state(false);

  let isVisible = $derived(analysis.isAutoRunning || analysis.isAutoPaused);
  let stats = $derived(analysis.autoStats);
  let currentArticle = $derived(analysis.autoCurrentArticle);

  function toggleMinimize() {
    minimized = !minimized;
  }

  function handlePauseResume() {
    if (analysis.isAutoPaused) {
      analysis.resumeAuto();
    } else {
      analysis.pauseAuto();
    }
  }

  function handleStop() {
    analysis.forceStopAuto();
  }

  // GPU toast — once per session
  $effect(() => {
    if (typeof window === 'undefined') return;
    if (isVisible && !sessionStorage.getItem('pr_gpu_toast_shown')) {
      showGpuToast = true;
      sessionStorage.setItem('pr_gpu_toast_shown', '1');
      setTimeout(() => { showGpuToast = false; }, 3000);
    }
  });
</script>

{#if isVisible}
  {#if minimized}
    <button class="auto-runner-badge" class:mobile={media.isMobile} onclick={toggleMinimize}>
      <span class="material-symbols-outlined">psychology</span>
      <span class="badge-count">{stats.analyzed}</span>
    </button>
  {:else}
    <div class="auto-runner-bar" class:mobile={media.isMobile} class:paused={analysis.isAutoPaused}>
      <div class="bar-header">
        <div class="bar-title-row">
          <span class="material-symbols-outlined bar-icon">psychology</span>
          <span class="bar-title">
            {analysis.isAutoPaused ? '自動分析（暫停）' : '自動分析中'}
          </span>
        </div>
        <button class="bar-minimize" onclick={toggleMinimize} aria-label="最小化">
          <span class="material-symbols-outlined">minimize</span>
        </button>
      </div>

      {#if currentArticle && !analysis.isAutoPaused}
        <p class="current-article">{currentArticle.title}</p>
      {/if}

      <div class="bar-stats">
        <span class="stat">已分析 {stats.analyzed}</span>
        <span class="stat-sep">·</span>
        <span class="stat">略過 {stats.skipped}</span>
        {#if stats.failed > 0}
          <span class="stat-sep">·</span>
          <span class="stat error">失敗 {stats.failed}</span>
        {/if}
      </div>

      {#if analysis.autoStopReason}
        <p class="stop-reason">{analysis.autoStopReason}</p>
      {/if}

      <div class="bar-actions">
        <button class="bar-btn" onclick={handlePauseResume}>
          <span class="material-symbols-outlined">
            {analysis.isAutoPaused ? 'play_arrow' : 'pause'}
          </span>
          {analysis.isAutoPaused ? '繼續' : '暫停'}
        </button>
        <button class="bar-btn stop" onclick={handleStop}>
          <span class="material-symbols-outlined">stop</span>
          停止
        </button>
      </div>
    </div>
  {/if}

  {#if showGpuToast}
    <div class="gpu-toast" class:mobile={media.isMobile}>
      GPU 運作中，不影響閱讀
    </div>
  {/if}
{/if}

<style>
  .auto-runner-bar {
    position: fixed;
    z-index: 150;
    background: var(--md-sys-color-surface-container-high);
    border-radius: var(--md-sys-shape-corner-large);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: var(--md-sys-elevation-3);
    animation: slide-in 0.3s ease-out;
  }
  .auto-runner-bar.mobile {
    bottom: 88px;
    left: 8px;
    right: 8px;
  }
  .auto-runner-bar:not(.mobile) {
    bottom: 24px;
    right: 24px;
    width: 380px;
  }
  .auto-runner-bar.paused { opacity: 0.85; }
  @keyframes slide-in {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .bar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .bar-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bar-icon {
    font-size: 20px;
    color: var(--md-sys-color-primary);
  }
  .bar-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .bar-minimize {
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--md-sys-shape-corner-full);
  }
  .bar-minimize:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }
  .current-article {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .stat-sep { opacity: 0.5; }
  .stat.error { color: var(--md-sys-color-error); }
  .stop-reason {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-error);
  }
  .bar-actions {
    display: flex;
    gap: 8px;
  }
  .bar-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small);
    background: transparent;
    color: var(--md-sys-color-primary);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .bar-btn:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  }
  .bar-btn.stop {
    color: var(--md-sys-color-error);
    border-color: var(--md-sys-color-error);
  }
  .bar-btn.stop:hover {
    background: color-mix(in srgb, var(--md-sys-color-error) 8%, transparent);
  }
  .auto-runner-badge {
    position: fixed;
    z-index: 150;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    cursor: pointer;
    box-shadow: var(--md-sys-elevation-2);
    font: var(--md-sys-typescale-label-large-font);
  }
  .auto-runner-badge.mobile {
    bottom: 88px;
    right: 16px;
  }
  .auto-runner-badge:not(.mobile) {
    bottom: 24px;
    right: 24px;
  }
  .badge-count { font-weight: 600; }
  .gpu-toast {
    position: fixed;
    z-index: 160;
    bottom: 160px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    border-radius: var(--md-sys-shape-corner-small);
    font: var(--md-sys-typescale-body-small-font);
    animation: toast-fade 3s ease-in-out forwards;
  }
  .gpu-toast.mobile { bottom: 170px; }
  @keyframes toast-fade {
    0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
    10% { opacity: 1; transform: translateX(-50%) translateY(0); }
    80% { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
