<script>
  import Card from '$lib/components/ui/Card.svelte';
  import ArticleCard from './ArticleCard.svelte';

  let { articles = [], divergenceScore = 0 } = $props();

  let expanded = $state(false);

  let displayArticles = $derived(expanded ? articles : articles.slice(0, 2));

  function toggleExpand() {
    expanded = !expanded;
  }
</script>

<Card variant="filled">
  <div class="cluster">
    <button class="cluster-header" onclick={toggleExpand}>
      <div class="header-left">
        <span class="material-symbols-outlined cluster-icon">hub</span>
        <span class="cluster-title">跨媒體報導</span>
        <span class="article-count">{articles.length} 篇</span>
      </div>
      <div class="header-right">
        <span class="divergence" class:high={divergenceScore >= 60} class:medium={divergenceScore >= 30 && divergenceScore < 60}>
          分歧 {divergenceScore}%
        </span>
        <span class="material-symbols-outlined expand-icon" class:rotated={expanded}>
          expand_more
        </span>
      </div>
    </button>

    <div class="cluster-body" class:collapsed={!expanded && articles.length > 2}>
      {#each displayArticles as article (article.article_hash)}
        <div class="compact-card">
          <ArticleCard {article} />
        </div>
      {/each}
      {#if !expanded && articles.length > 2}
        <button class="show-more" onclick={toggleExpand}>
          顯示其餘 {articles.length - 2} 篇
        </button>
      {/if}
    </div>
  </div>
</Card>

<style>
  .cluster {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cluster-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cluster-icon {
    font-size: 20px;
    color: var(--md-sys-color-primary);
  }
  .cluster-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .article-count {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .divergence {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-surface-container);
  }
  .divergence.high {
    color: var(--md-sys-color-error);
    background: var(--md-sys-color-error-container);
  }
  .divergence.medium {
    color: var(--md-sys-color-tertiary);
    background: var(--md-sys-color-tertiary-container);
  }
  .expand-icon {
    font-size: 20px;
    color: var(--md-sys-color-on-surface-variant);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .expand-icon.rotated {
    transform: rotate(180deg);
  }
  .cluster-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .compact-card {
    font-size: 0.9em;
  }
  .show-more {
    padding: 6px 0;
    border: none;
    background: transparent;
    color: var(--md-sys-color-primary);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    text-align: center;
  }
  .show-more:hover {
    text-decoration: underline;
  }
</style>
