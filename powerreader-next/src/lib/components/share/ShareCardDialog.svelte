<script>
  import { fade, fly } from 'svelte/transition';
  import { t } from '$lib/i18n/zh-TW.js';
  import { renderArticleCard, renderEventCard } from '$lib/share/card-renderer.js';
  import { shareCard } from '$lib/share/card-share.js';

  let { open = $bindable(false), articleData = null, eventData = null } = $props();

  let previewUrl = $state('');
  let generating = $state(false);
  let sharing = $state(false);
  let statusMsg = $state('');
  let blob = $state(null);

  $effect(() => {
    if (open) {
      generatePreview();
    } else {
      cleanup();
    }
  });

  async function generatePreview() {
    generating = true;
    statusMsg = '';
    try {
      if (articleData) {
        blob = await renderArticleCard(articleData);
      } else if (eventData) {
        blob = await renderEventCard(eventData);
      } else {
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
    } catch (err) {
      statusMsg = t('share.card.error');
      console.error('[ShareCard] render failed:', err);
    } finally {
      generating = false;
    }
  }

  async function handleShare() {
    if (!blob) return;
    sharing = true;
    statusMsg = '';
    try {
      const title = articleData?.title ?? eventData?.title ?? 'PowerReader';
      const result = await shareCard(blob, title);
      statusMsg = result.method === 'native'
        ? t('share.card.shared')
        : t('share.card.downloaded');
    } catch {
      statusMsg = t('share.card.error');
    } finally {
      sharing = false;
    }
  }

  async function handleDownload() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'powerreader-analysis.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusMsg = t('share.card.downloaded');
  }

  function handleClose() {
    open = false;
  }

  function cleanup() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
    }
    blob = null;
    statusMsg = '';
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') handleClose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-backdrop"
    transition:fade={{ duration: 200 }}
    onclick={handleClose}
    onkeydown={handleKeydown}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dialog-content"
      transition:fly={{ y: 30, duration: 300 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={t('share.card.title')}
    >
      <header class="dialog-header">
        <h2 class="dialog-title">{t('share.card.title')}</h2>
        <button class="close-btn" onclick={handleClose} aria-label={t('common.button.close')}>
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <div class="dialog-body">
        {#if generating}
          <div class="loading-state">
            <div class="spinner"></div>
            <span>{t('share.card.generating')}</span>
          </div>
        {:else if previewUrl}
          <div class="preview-container">
            <img src={previewUrl} alt={t('share.card.preview_alt')} class="preview-img" />
          </div>
        {/if}

        {#if statusMsg}
          <p class="status-msg">{statusMsg}</p>
        {/if}
      </div>

      <footer class="dialog-actions">
        <button class="action-btn secondary" onclick={handleDownload} disabled={!blob || generating}>
          <span class="material-symbols-outlined">download</span>
          {t('share.card.download')}
        </button>
        <button class="action-btn primary" onclick={handleShare} disabled={!blob || generating || sharing}>
          <span class="material-symbols-outlined">share</span>
          {sharing ? t('share.card.sharing') : t('share.card.share')}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.32);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }
  .dialog-content {
    background: var(--md-sys-color-surface-container-high);
    border-radius: 0;
    border: 4px solid var(--pr-ink);
    box-shadow: 8px 8px 0px var(--pr-ink);
    max-width: 480px;
    width: 100%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 0;
  }
  .dialog-title {
    margin: 0;
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
  }
  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
  }
  .close-btn:hover {
    border-color: var(--pr-ink);
    color: var(--md-sys-color-on-surface);
  }
  .dialog-body {
    padding: 16px 24px;
    overflow-y: auto;
    flex: 1;
  }
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px;
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-body-medium-font);
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--md-sys-color-outline-variant);
    border-top-color: var(--md-sys-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .preview-container {
    display: flex;
    justify-content: center;
    background: var(--md-sys-color-surface-container);
    border: 2px solid var(--pr-ink);
    padding: 8px;
  }
  .preview-img {
    width: 100%;
    max-height: 50vh;
    object-fit: contain;
  }
  .status-msg {
    margin: 12px 0 0;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-primary);
    text-align: center;
  }
  .dialog-actions {
    display: flex;
    gap: 8px;
    padding: 16px 24px 20px;
    justify-content: flex-end;
  }
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 20px;
    border: none;
    border-radius: 0;
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .action-btn .material-symbols-outlined {
    font-size: 20px;
  }
  .action-btn:disabled {
    opacity: 0.38;
    cursor: default;
    pointer-events: none;
  }
  .action-btn.primary {
    background: #000000;
    color: #FFFFFF;
  }
  .action-btn.primary:hover {
    box-shadow: var(--md-sys-elevation-1);
  }
  .action-btn.secondary {
    background: transparent;
    color: var(--md-sys-color-on-surface);
    border: 2px solid var(--pr-ink);
  }
  .action-btn.secondary:hover {
    background: var(--md-sys-color-surface-container);
  }
</style>
