<script>
  /**
   * ComparisonTable — cross-media comparison table.
   * Extracted from event detail page for modularity.
   */
  import SourceIcon from '$lib/components/article/SourceIcon.svelte';

  let { articlesBySource = [], onArticleClick } = $props();
</script>

{#if articlesBySource.length >= 2}
  <div class="comparison-section">
    <h2 class="section-heading">
      <span class="material-symbols-outlined">compare_arrows</span>
      跨媒體比較
    </h2>
    <div class="comparison-table">
      <div class="comparison-header-row">
        <span class="col-source">來源</span>
        <span class="col-title">標題</span>
        <span class="col-bias">偏向</span>
      </div>
      {#each articlesBySource as [source, sourceArticles], rowIdx}
        <div class="comparison-row" class:odd={rowIdx % 2 === 1}>
          <div class="comparison-source">
            <SourceIcon source={source} size="medium" />
            <span class="source-name">{source}</span>
            <span class="source-count">{sourceArticles.length} 篇</span>
          </div>
          <div class="comparison-articles">
            {#each sourceArticles as art}
              <div class="comparison-article">
                {#if art.primary_url}
                  <a class="art-title-link" href={art.primary_url} target="_blank" rel="noopener">
                    <span class="art-title">{art.title}</span>
                    <span class="material-symbols-outlined art-external">open_in_new</span>
                  </a>
                {:else}
                  <span class="art-title">{art.title}</span>
                {/if}
                {#if art.bias_score != null}
                  <span class="art-bias" class:green={art.bias_score <= 40} class:blue={art.bias_score >= 60}>
                    {art.bias_score}
                  </span>
                {:else}
                  <span class="art-bias pending">待分析</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .comparison-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: var(--pr-section-gap-large, 40px) 0 var(--pr-section-gap-small, 12px) 0;
    font: var(--pr-heading-secondary, 800 clamp(18px, 3vw, 24px)/1.3 var(--pr-font-sans));
    color: var(--pr-ink);
  }
  .section-heading .material-symbols-outlined {
    font-size: var(--pr-section-icon, clamp(20px, 3vw, 28px));
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }

  .comparison-table {
    display: flex;
    flex-direction: column;
    border-radius: 0;
    overflow: hidden;
    border: 2px solid var(--pr-ink);
    box-shadow: none;
    background: #FFFFFF;
  }
  .comparison-header-row {
    display: none;
    padding: 12px 16px;
    background: #000000;
    color: #FFFFFF;
    font: 900 16px var(--pr-font-sans);
    gap: 8px;
  }
  @media (min-width: 768px) {
    .comparison-header-row {
      display: flex;
    }
    .col-source { width: 120px; flex-shrink: 0; }
    .col-title { flex: 1; }
    .col-bias { width: 60px; text-align: right; flex-shrink: 0; }
  }
  .comparison-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    background: #FFFFFF;
    border-top: 1px solid var(--md-sys-color-surface-container-high);
  }
  .comparison-row:first-of-type {
    border-top: none;
  }
  .comparison-row.odd {
    background: var(--md-sys-color-surface-container-low, #FAFAFA);
  }
  .comparison-source {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .source-name {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 600;
  }
  .source-count {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .comparison-articles {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 8px;
  }
  .comparison-article {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    min-height: 44px;
    width: 100%;
    transition: background 150ms ease;
  }
  .comparison-article:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent);
  }
  .art-title-link {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    text-decoration: none;
    color: inherit;
    flex: 1;
    min-width: 0;
  }
  .art-title-link:hover .art-title {
    text-decoration: underline;
    color: var(--md-sys-color-on-surface);
  }
  .art-title-link:focus-visible {
    outline: 2px solid #FF5722;
    outline-offset: 2px;
  }
  .art-external {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 2px;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .art-title-link:hover .art-external {
    opacity: 1;
    color: var(--md-sys-color-primary);
  }
  .art-title {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex: 1;
  }
  .art-bias {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-surface-container);
  }
  .art-bias.green { color: var(--camp-green); background: rgba(46, 125, 50, 0.08); }
  .art-bias.blue { color: var(--camp-blue); background: rgba(21, 101, 192, 0.08); }
  .art-bias.pending {
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container-high);
    opacity: 0.7;
  }
</style>
