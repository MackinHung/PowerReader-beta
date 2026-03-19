<script>
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import ControversyMeter from '$lib/components/data-viz/ControversyMeter.svelte';
  import EmotionMeter from '$lib/components/data-viz/EmotionMeter.svelte';
  import KnowledgePanel from '$lib/components/article/KnowledgePanel.svelte';
  import { t } from '$lib/i18n/zh-TW.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';

  let { article = null, open = false, onclose } = $props();

  let isPolitical = $derived(article?.is_political !== false);
  const media = getMediaQueryStore();

  function handleOpenOriginal() {
    if (article?.primary_url) {
      window.open(article.primary_url, '_blank', 'noopener');
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && open) {
      onclose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && article}
  {#if media.isMobile}
    <!-- Mobile: fullscreen modal -->
    <div class="panel-backdrop" onclick={onclose} role="presentation"></div>
    <div class="panel-mobile" role="dialog" aria-label="分析詳情" aria-modal="true">
      <div class="panel-header">
        <button class="close-btn" onclick={onclose} aria-label="關閉">
          <span class="material-symbols-outlined">close</span>
        </button>
        <h2 class="panel-title">分析詳情</h2>
        <button class="open-btn" onclick={handleOpenOriginal} aria-label="查看原文">
          <span class="material-symbols-outlined">open_in_new</span>
        </button>
      </div>
      <div class="panel-body">
        {@render panelContent()}
      </div>
    </div>
  {:else}
    <!-- Desktop: slide-in side panel -->
    <div class="panel-backdrop" onclick={onclose} role="presentation"></div>
    <aside class="panel-desktop" role="complementary" aria-label="分析詳情">
      <div class="panel-header">
        <h2 class="panel-title">分析詳情</h2>
        <div class="panel-header-actions">
          <button class="open-btn" onclick={handleOpenOriginal} aria-label="查看原文" title="查看原文">
            <span class="material-symbols-outlined">open_in_new</span>
          </button>
          <button class="close-btn" onclick={onclose} aria-label="關閉">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
      <div class="panel-body">
        {@render panelContent()}
      </div>
    </aside>
  {/if}
{/if}

{#snippet panelContent()}
  <h3 class="article-title">{article.title ?? ''}</h3>

  {#if !isPolitical}
    <div class="not-political-badge">
      <span class="material-symbols-outlined">info</span>
      <span>{t('analysis.not_political')}</span>
    </div>
  {/if}

  {#if isPolitical && article.bias_score != null}
    <Card variant="filled">
      <div class="section">
        <span class="section-label">立場偏向</span>
        <BiasSpectrum score={article.bias_score} />
      </div>
    </Card>
  {/if}

  {#if isPolitical && article.camp_ratio}
    <Card variant="filled">
      <div class="section">
        <span class="section-label">陣營比例</span>
        <CampBar
          green={article.camp_ratio?.green ?? 0}
          white={article.camp_ratio?.white ?? 0}
          blue={article.camp_ratio?.blue ?? 0}
        />
      </div>
    </Card>
  {/if}

  {#if article.controversy_score != null}
    <ControversyMeter level={article.controversy_score} />
  {/if}

  {#if article.emotion_intensity != null}
    <EmotionMeter intensity={article.emotion_intensity} />
  {/if}

  {#if article.knowledge_items?.length}
    <KnowledgePanel items={article.knowledge_items} />
  {/if}

  <Button onclick={handleOpenOriginal} fullWidth>
    <span class="material-symbols-outlined">open_in_new</span>
    查看原文
  </Button>
{/snippet}

<style>
  .panel-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.32);
    z-index: 200;
  }

  /* Mobile fullscreen modal */
  .panel-mobile {
    position: fixed;
    inset: 0;
    z-index: 201;
    background: var(--md-sys-color-surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Desktop side panel */
  .panel-desktop {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 400px;
    max-width: 100vw;
    z-index: 201;
    background: var(--md-sys-color-surface);
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 64px;
    padding: 0 8px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  .panel-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .panel-title {
    flex: 1;
    margin: 0;
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
    padding: 0 8px;
  }
  .close-btn, .open-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
  }
  .close-btn:hover, .open-btn:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .article-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .not-political-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    font: var(--md-sys-typescale-label-medium-font);
  }
  .not-political-badge .material-symbols-outlined {
    font-size: 18px;
  }
  .section-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .summary-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
    white-space: pre-wrap;
  }
</style>
