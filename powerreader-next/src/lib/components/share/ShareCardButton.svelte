<script>
  import { t } from '$lib/i18n/zh-TW.js';
  import ShareCardDialog from './ShareCardDialog.svelte';

  let {
    articleData = null,
    eventData = null,
    variant = 'icon',
  } = $props();

  let dialogOpen = $state(false);
</script>

{#if variant === 'icon'}
  <button
    class="share-card-btn icon"
    onclick={() => { dialogOpen = true; }}
    aria-label={t('share.card.button')}
    title={t('share.card.button')}
  >
    <span class="material-symbols-outlined">share</span>
  </button>
{:else}
  <button
    class="share-card-btn text"
    onclick={() => { dialogOpen = true; }}
  >
    <span class="material-symbols-outlined">share</span>
    {t('share.card.button')}
  </button>
{/if}

<ShareCardDialog bind:open={dialogOpen} {articleData} {eventData} />

<style>
  .share-card-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .share-card-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .share-card-btn:hover::after {
    opacity: 0.08;
  }
  .share-card-btn:active::after {
    opacity: 0.12;
  }
  .icon {
    width: 48px;
    height: 48px;
    padding: 0;
    font-size: 24px;
  }
  .text {
    gap: 6px;
    padding: 8px 16px;
    font: var(--md-sys-typescale-label-large-font);
    border-radius: var(--md-sys-shape-corner-small);
  }
  .text .material-symbols-outlined {
    font-size: 20px;
  }
</style>
