<script>
  import Card from '$lib/components/ui/Card.svelte';
  import SourceBadge from './SourceBadge.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';

  let { article = {}, onclick, onanalyze } = $props();

  const STATUS_COLORS = {
    none: 'var(--md-sys-color-outline)',
    pending: 'var(--md-sys-color-tertiary)',
    done: 'var(--camp-green)',
  };

  let statusColor = $derived(STATUS_COLORS[article.analysis_status ?? 'none'] ?? STATUS_COLORS.none);

  let formattedDate = $derived(() => {
    if (!article.published_at) return '';
    const d = new Date(article.published_at);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  function handleCardClick(e) {
    // Don't trigger card click when clicking analyze button
    if (e.target.closest('.analyze-btn')) return;
    onclick?.();
  }

  function handleAnalyze(e) {
    e.stopPropagation();
    onanalyze?.();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.();
    }
  }
</script>

<div
  class="article-card-wrapper"
  onclick={handleCardClick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-label="開啟原文：{article.title ?? ''}"
>
  <Card variant="elevated">
    <div class="card-inner">
      <div class="card-top">
        <SourceBadge source={article.source} />
        <span class="date">{formattedDate()}</span>
        <span class="status-dot" style="background: {statusColor}"></span>
      </div>
      <h3 class="card-title">{article.title ?? ''}</h3>
      <div class="card-bottom">
        {#if article.bias_score != null}
          <div class="mini-spectrum">
            <BiasSpectrum score={article.bias_score} />
          </div>
        {/if}
        {#if article.camp_ratio}
          <div class="mini-camp">
            <CampBar
              green={article.camp_ratio?.green ?? 0}
              white={article.camp_ratio?.white ?? 0}
              blue={article.camp_ratio?.blue ?? 0}
            />
          </div>
        {/if}
      </div>
      <div class="card-actions">
        {#if article.primary_url}
          <span class="external-hint">
            <span class="material-symbols-outlined" style="font-size: 16px;">open_in_new</span>
            原文
          </span>
        {/if}
        {#if onanalyze}
          <button
            class="analyze-btn"
            onclick={handleAnalyze}
            aria-label="詳細分析"
            title="詳細分析"
          >
            <span class="material-symbols-outlined">analytics</span>
          </button>
        {/if}
      </div>
    </div>
  </Card>
</div>

<style>
  .article-card-wrapper {
    display: block;
    cursor: pointer;
    border-radius: var(--md-sys-shape-corner-medium);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .article-card-wrapper:hover {
    transform: translateY(-2px);
  }
  .article-card-wrapper:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
  .card-inner {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .date {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: auto;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .card-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }
  .card-bottom {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mini-spectrum {
    max-width: 180px;
  }
  .mini-camp {
    width: 100%;
  }
  .card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
  }
  .external-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-primary);
  }
  .analyze-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    cursor: pointer;
  }
  .analyze-btn:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
    color: var(--md-sys-color-primary);
  }
</style>
