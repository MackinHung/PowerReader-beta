<script>
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PreChecks from '$lib/components/analysis/PreChecks.svelte';
  import AutoRunnerBar from '$lib/components/analysis/AutoRunnerBar.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import { getArticlesStore } from '$lib/stores/articles.svelte.js';
  import { getAnalysisStore } from '$lib/stores/analysis.svelte.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';

  const articlesStore = getArticlesStore();
  const analysisStore = getAnalysisStore();
  const media = getMediaQueryStore();

  let checks = $state({ gpu: false, model: false, article: false, queue: false });
  let recentResults = $state([]);

  // Init analysis store subscriptions
  $effect(() => {
    const cleanup = analysisStore.init();
    return cleanup;
  });

  // Load articles if needed
  $effect(() => {
    if (articlesStore.articles.length === 0) {
      articlesStore.fetchArticles('all', 1);
    }
  });

  // Check GPU support
  $effect(() => {
    if (typeof window !== 'undefined') {
      checks = {
        ...checks,
        gpu: !!navigator.gpu,
        queue: true
      };
    }
  });

  let autoRunnerState = $derived(
    analysisStore.isAutoRunning ? 'running' :
    analysisStore.isAutoPaused ? 'paused' : 'idle'
  );

  function handleStartAnalysis() {
    const first = articlesStore.articles.find(a => a.analysis_status !== 'done');
    if (first) {
      goto(`/analyze/${first.article_hash || first.article_id}`);
    }
  }

  function selectArticle(article) {
    goto(`/analyze/${article.article_hash || article.article_id}`);
  }

  async function handleStartAuto() {
    await analysisStore.startAuto();
  }

  function handlePauseAuto() {
    analysisStore.pauseAuto();
  }

  function handleResumeAuto() {
    analysisStore.resumeAuto();
  }

  function handleStopAuto() {
    analysisStore.forceStopAuto();
  }
</script>

<div class="analyze-page" class:desktop={media.isDesktop}>
  <div class="analyze-controls">
    <Card variant="filled">
      <PreChecks {checks} onstart={handleStartAnalysis} />
    </Card>

    <section class="section">
      <h3 class="section-title">自動分析</h3>
    <div class="auto-controls">
      {#if autoRunnerState === 'idle'}
        <Button onclick={handleStartAuto}>
          <span class="material-symbols-outlined">play_arrow</span>
          開始自動分析
        </Button>
      {:else}
        <AutoRunnerBar
          status={autoRunnerState}
          currentArticle={analysisStore.autoCurrentArticle || ''}
          progress={{ done: analysisStore.autoStats.analyzed, total: analysisStore.autoStats.analyzed + 5 }}
          stats={{ analyzed: analysisStore.autoStats.analyzed, success_rate: analysisStore.autoStats.analyzed > 0 ? (analysisStore.autoStats.analyzed - analysisStore.autoStats.failed) / analysisStore.autoStats.analyzed : 0 }}
          onpause={handlePauseAuto}
          onresume={handleResumeAuto}
          onstop={handleStopAuto}
        />
      {/if}
    </div>
  </section>
  </div>

  <div class="analyze-articles">
  <section class="section">
    <h3 class="section-title">選擇文章分析</h3>
    {#if articlesStore.loading}
      <div class="loading-row">
        <ProgressIndicator type="linear" />
      </div>
    {:else}
      <div class="pick-list">
        {#each articlesStore.articles.slice(0, 10) as article (article.article_hash || article.article_id)}
          <Card variant="elevated" clickable onclick={() => selectArticle(article)}>
            <div class="pick-item">
              <span class="pick-title">{article.title}</span>
              <span class="pick-status" class:done={article.analysis_status === 'done'}>
                {article.analysis_status === 'done' ? '已分析' : '未分析'}
              </span>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </section>

  {#if recentResults.length > 0}
    <section class="section">
      <h3 class="section-title">最近分析結果</h3>
      <div class="results-list">
        {#each recentResults as result}
          <Card variant="filled" clickable onclick={() => goto(`/article/${result.article_id}`)}>
            <div class="result-item">
              <span class="result-title">{result.title}</span>
              <span class="result-score">偏向: {result.bias_score}</span>
            </div>
          </Card>
        {/each}
      </div>
    </section>
  {/if}
  </div>
</div>

<style>
  .analyze-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px;
  }
  .analyze-page.desktop {
    flex-direction: row;
    gap: 24px;
    align-items: flex-start;
  }
  .analyze-controls {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .analyze-page.desktop .analyze-controls {
    width: 340px;
    flex-shrink: 0;
    position: sticky;
    top: 80px;
  }
  .analyze-articles {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .auto-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .loading-row {
    padding: 8px 0;
  }
  .pick-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pick-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .pick-title {
    flex: 1;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick-status {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
  .pick-status.done {
    color: var(--camp-green, #4CAF50);
  }
  .results-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .result-title {
    flex: 1;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-score {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
</style>
