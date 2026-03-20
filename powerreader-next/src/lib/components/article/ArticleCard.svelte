<script>
  import Card from '$lib/components/ui/Card.svelte';
  import SourceBadge from './SourceBadge.svelte';

  let { article = {}, onclick, onanalyze } = $props();

  let analysisCount = $derived(article.analysis_count ?? 0);

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
  <div class="brutalist-article">
    <div class="card-top">
      <SourceBadge source={article.source} />
      <span class="date">{formattedDate()}</span>
    </div>
    <h3 class="card-title">{article.title ?? ''}</h3>
    <div class="card-bottom">
      {#if analysisCount > 0}
        <span class="analysis-badge analyzed">
          <span class="material-symbols-outlined badge-icon">check_circle</span>
          已有 {analysisCount} 篇分析
        </span>
      {:else}
        <span class="analysis-badge pending">
          <span class="material-symbols-outlined badge-icon">smart_toy</span>
          待分析
        </span>
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
</div>

<style>
  .article-card-wrapper {
    display: block;
    cursor: pointer;
    transition: transform 150ms ease;
  }
  .article-card-wrapper:hover {
    transform: translate(-2px, -2px);
  }
  .article-card-wrapper:focus-visible {
    outline: 4px solid #FF5722;
    outline-offset: 4px;
  }
  .brutalist-article {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #FFFFFF;
    border: 3px solid var(--pr-ink);
    box-shadow: 4px 4px 0px var(--pr-ink);
    padding: 20px;
    border-radius: 0;
    transition: box-shadow 150ms ease;
  }
  .article-card-wrapper:hover .brutalist-article {
    box-shadow: 6px 6px 0px var(--pr-ink);
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
  .card-title {
    font: var(--md-sys-typescale-title-small-font);
    font-family: var(--pr-font-serif);
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
    align-items: center;
  }
  .analysis-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-small-font);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .analysis-badge.analyzed {
    color: var(--md-sys-color-primary);
    background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  }
  .analysis-badge.pending {
    color: var(--md-sys-color-outline);
    background: color-mix(in srgb, var(--md-sys-color-outline) 6%, transparent);
  }
  .badge-icon {
    font-size: 14px;
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
