<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SourceBadge from '$lib/components/article/SourceBadge.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import ControversyMeter from '$lib/components/data-viz/ControversyMeter.svelte';
  import KnowledgePanel from '$lib/components/article/KnowledgePanel.svelte';
  import FeedbackButtons from '$lib/components/feedback/FeedbackButtons.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import { getArticlesStore } from '$lib/stores/articles.svelte.js';
  import * as api from '$lib/core/api.js';

  const articlesStore = getArticlesStore();
  let articleId = $derived(page.params.id);

  let article = $state(null);
  let loading = $state(true);
  let error = $state(null);

  $effect(() => {
    loadArticle(articleId);
  });

  async function loadArticle(id) {
    loading = true;
    error = null;

    // Try store first
    const cached = articlesStore.getArticle(id);
    if (cached) {
      article = cached;
      loading = false;
      return;
    }

    // Fetch from API
    try {
      const result = await api.fetchArticle(id);
      if (result.success) {
        article = result.data;
      } else {
        error = result.error?.message || '無法載入文章';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: article?.title,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  function goAnalyze() {
    goto(`/analyze/${articleId}`);
  }
</script>

<div class="article-page">
  {#if loading}
    <div class="loading-state">
      <ProgressIndicator type="circular" />
    </div>
  {:else if error}
    <div class="error-state">
      <span class="material-symbols-outlined">error</span>
      <p>{error}</p>
      <Button variant="outlined" onclick={() => loadArticle(articleId)}>重試</Button>
    </div>
  {:else if article}
    <div class="article-header">
      <div class="meta-row">
        <SourceBadge source={article.source} size="medium" />
        <span class="date">{formatDate(article.published_at)}</span>
      </div>
      <h1 class="article-title">{article.title}</h1>
      {#if article.primary_url}
        <a href={article.primary_url} target="_blank" rel="noopener" class="original-link">
          <span class="material-symbols-outlined">open_in_new</span>
          查看原文
        </a>
      {/if}
    </div>

    <div class="viz-section">
      {#if article.bias_score != null}
        <Card variant="filled">
          <div class="viz-block">
            <span class="viz-label">立場偏向</span>
            <BiasSpectrum score={article.bias_score} />
          </div>
        </Card>
      {/if}

      {#if article.camp_ratio}
        <Card variant="filled">
          <div class="viz-block">
            <span class="viz-label">陣營比例</span>
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
    </div>

    {#if article.content_markdown || article.summary}
      <Card variant="filled">
        <div class="content-section">
          <h3>摘要</h3>
          <p>{article.summary || article.content_markdown || article.title}</p>
        </div>
      </Card>
    {/if}

    {#if article.knowledge_items?.length}
      <KnowledgePanel items={article.knowledge_items} />
    {/if}

    <div class="action-row">
      <FeedbackButtons articleId={articleId} />
      <button class="icon-action" onclick={handleShare} aria-label="分享">
        <span class="material-symbols-outlined">share</span>
      </button>
    </div>

    {#if article.analysis_status !== 'done'}
      <button class="fab" onclick={goAnalyze} aria-label="分析此文章">
        <span class="material-symbols-outlined">psychology</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .article-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  .loading-state, .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 16px;
    gap: 16px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .error-state .material-symbols-outlined {
    font-size: 48px;
    color: var(--md-sys-color-error);
  }
  .article-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .meta-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .date {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .article-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
  }
  .original-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-primary);
    text-decoration: none;
  }
  .original-link:hover {
    text-decoration: underline;
  }
  .viz-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .viz-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .viz-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .content-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .content-section h3 {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .content-section p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
  }
  .icon-action {
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
  .icon-action:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }
  .fab {
    position: fixed;
    bottom: 96px;
    right: 16px;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 16px;
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    box-shadow: var(--md-sys-elevation-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .fab:hover {
    box-shadow: var(--md-sys-elevation-4);
  }
  .fab .material-symbols-outlined {
    font-size: 24px;
  }
</style>
