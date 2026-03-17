<script>
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EventCard from '$lib/components/article/EventCard.svelte';
  import AutoRunnerBar from '$lib/components/analysis/AutoRunnerBar.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import { getArticlesStore } from '$lib/stores/articles.svelte.js';
  import { getEventsStore } from '$lib/stores/events.svelte.js';
  import { getAnalysisStore } from '$lib/stores/analysis.svelte.js';
  import { getMediaQueryStore } from '$lib/stores/mediaQuery.svelte.js';

  const articlesStore = getArticlesStore();
  const eventsStore = getEventsStore();
  const analysisStore = getAnalysisStore();
  const media = getMediaQueryStore();

  // ── View mode: events (cluster) or articles (flat) ──
  let viewMode = $state('events');

  // ── Inline analysis state ──
  let analyzingArticle = $state(null);   // currently analyzing article object
  let analysisResult = $state(null);     // last result
  let analysisRunning = $state(false);
  let analysisError = $state(null);
  let recentResults = $state([]);

  // Init analysis store subscriptions
  $effect(() => {
    const cleanup = analysisStore.init();
    return cleanup;
  });

  // Load events + articles on mount
  $effect(() => {
    untrack(() => {
      if (eventsStore.events.length === 0) eventsStore.fetchEvents(1);
      if (articlesStore.articles.length === 0) articlesStore.fetchArticles('all', 1);
    });
  });

  let autoRunnerState = $derived(
    analysisStore.isAutoRunning ? 'running' :
    analysisStore.isAutoPaused ? 'paused' : 'idle'
  );

  // ── Event cluster handlers ──
  function handleEventToggle(event) {
    if (eventsStore.getExpandedArticles(event.cluster_id)) {
      eventsStore.collapseEvent(event.cluster_id);
    } else {
      eventsStore.expandEvent(event.cluster_id, event.title);
    }
  }

  // ── Analysis handlers ──
  async function runArticleAnalysis(article) {
    analyzingArticle = article;
    analysisRunning = true;
    analysisResult = null;
    analysisError = null;

    try {
      const result = await analysisStore.analyze(
        article.article_id,
        article
      );
      analysisResult = { ...result, title: article.title, article_id: article.article_id };
      recentResults = [
        { ...result, title: article.title, article_id: article.article_id },
        ...recentResults.slice(0, 9)
      ];
    } catch (e) {
      analysisError = e.message || '分析失敗';
    } finally {
      analysisRunning = false;
    }
  }

  function handleArticleClick(article) {
    goto(`/article/${article.article_id}`);
  }

  // ── Auto-runner controls ──
  async function handleStartAuto() {
    await analysisStore.startAuto();
  }
  function handlePauseAuto() { analysisStore.pauseAuto(); }
  function handleResumeAuto() { analysisStore.resumeAuto(); }
  function handleStopAuto() { analysisStore.forceStopAuto(); }

  // Score label
  function biasLabel(score) {
    if (score == null) return '未知';
    if (score <= 25) return '偏綠';
    if (score <= 40) return '略偏綠';
    if (score <= 59) return '中立';
    if (score <= 74) return '略偏藍';
    return '偏藍';
  }

  function biasColor(score) {
    if (score == null) return 'var(--md-sys-color-on-surface-variant)';
    if (score <= 40) return 'var(--camp-green, #4CAF50)';
    if (score <= 59) return 'var(--camp-white, #9E9E9E)';
    return 'var(--camp-blue, #2196F3)';
  }
</script>

<div class="analyze-page" class:desktop={media.isDesktop}>
  <!-- ═══ Left: Controls ═══ -->
  <div class="analyze-controls">
    <!-- Auto Runner -->
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

    <!-- Inline Analysis Progress -->
    {#if analysisRunning && analyzingArticle}
      <Card variant="filled">
        <div class="inline-analysis">
          <div class="analysis-header">
            <ProgressIndicator type="circular" size={20} />
            <span class="analysis-stage">{analysisStore.analysisStage || '準備中...'}</span>
          </div>
          <p class="analysis-title">{analyzingArticle.title}</p>
          {#if analysisStore.progress > 0}
            <ProgressIndicator type="linear" value={analysisStore.progress * 100} />
          {/if}
          {#if analysisStore.eta}
            <span class="analysis-eta">預估剩餘 {Math.ceil(analysisStore.eta / 1000)} 秒</span>
          {/if}
        </div>
      </Card>
    {/if}

    <!-- Analysis Result -->
    {#if analysisResult && !analysisRunning}
      <Card variant="filled">
        <div class="analysis-result">
          <div class="result-header">
            <span class="material-symbols-outlined result-icon" style:color="var(--md-sys-color-primary)">check_circle</span>
            <span>分析完成</span>
          </div>
          <p class="result-article-title">{analysisResult.title}</p>
          <div class="result-scores">
            <div class="score-item">
              <span class="score-label">立場</span>
              <span class="score-value" style:color={biasColor(analysisResult.bias_score)}>
                {analysisResult.bias_score} ({biasLabel(analysisResult.bias_score)})
              </span>
            </div>
            <div class="score-item">
              <span class="score-label">爭議度</span>
              <span class="score-value">{analysisResult.controversy_score ?? '—'}</span>
            </div>
          </div>
          {#if analysisResult.points?.length > 0}
            <div class="result-points">
              {#each analysisResult.points as point}
                <p class="point">• {point}</p>
              {/each}
            </div>
          {/if}
          <Button variant="text" onclick={() => goto(`/article/${analysisResult.article_id}`)}>
            查看文章詳情
          </Button>
        </div>
      </Card>
    {/if}

    <!-- Analysis Error -->
    {#if analysisError && !analysisRunning}
      <Card variant="filled">
        <div class="analysis-error">
          <span class="material-symbols-outlined">error</span>
          <span>{analysisError}</span>
        </div>
      </Card>
    {/if}
  </div>

  <!-- ═══ Right: Article Selection ═══ -->
  <div class="analyze-articles">
    <!-- View Toggle -->
    <div class="view-toggle">
      <button class="toggle-btn" class:active={viewMode === 'events'} onclick={() => viewMode = 'events'}>
        <span class="material-symbols-outlined">hub</span>
        事件集群
      </button>
      <button class="toggle-btn" class:active={viewMode === 'articles'} onclick={() => viewMode = 'articles'}>
        <span class="material-symbols-outlined">article</span>
        全部文章
      </button>
    </div>

    {#if viewMode === 'events'}
      <!-- ═══ Event Clusters ═══ -->
      <section class="section">
        {#if eventsStore.loading}
          <div class="loading-row"><ProgressIndicator type="linear" /></div>
        {:else if eventsStore.events.length === 0}
          <div class="empty-state">
            <span class="material-symbols-outlined">hub</span>
            <p>暫無事件集群</p>
          </div>
        {:else}
          <div class="events-list">
            {#each eventsStore.events as event (event.cluster_id)}
              <EventCard
                {event}
                expanded={!!eventsStore.getExpandedArticles(event.cluster_id)}
                articles={eventsStore.getExpandedArticles(event.cluster_id) || []}
                articlesLoading={eventsStore.expandingId === event.cluster_id}
                ontoggle={() => handleEventToggle(event)}
                onArticleClick={handleArticleClick}
                onArticleAnalyze={runArticleAnalysis}
              />
            {/each}
          </div>
        {/if}
      </section>
    {:else}
      <!-- ═══ Flat Article List ═══ -->
      <section class="section">
        {#if articlesStore.loading}
          <div class="loading-row"><ProgressIndicator type="linear" /></div>
        {:else}
          <div class="pick-list">
            {#each articlesStore.articles.slice(0, 20) as article, i (article.article_id ?? i)}
              <Card variant="elevated">
                <div class="pick-item">
                  <button class="pick-title-btn" onclick={() => handleArticleClick(article)}>
                    {article.title}
                  </button>
                  <Button
                    variant="text"
                    onclick={() => runArticleAnalysis(article)}
                    disabled={analysisRunning}
                  >
                    {article.analysis_status === 'done' ? '重新分析' : '分析'}
                  </Button>
                </div>
              </Card>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Recent Results -->
    {#if recentResults.length > 0}
      <section class="section">
        <h3 class="section-title">本次分析結果</h3>
        <div class="results-list">
          {#each recentResults as result, i (result.article_id ?? i)}
            <Card variant="filled" clickable onclick={() => goto(`/article/${result.article_id}`)}>
              <div class="result-item">
                <span class="result-title">{result.title}</span>
                <span class="result-score" style:color={biasColor(result.bias_score)}>
                  {result.bias_score} ({biasLabel(result.bias_score)})
                </span>
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
    gap: 16px;
  }
  .analyze-page.desktop .analyze-controls {
    width: 360px;
    flex-shrink: 0;
    position: sticky;
    top: 80px;
  }
  .analyze-articles {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
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

  /* ── View Toggle ── */
  .view-toggle {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--md-sys-color-surface-container);
    border-radius: var(--md-sys-shape-corner-medium);
  }
  .toggle-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: var(--md-sys-shape-corner-small);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    transition: all 0.2s;
  }
  .toggle-btn .material-symbols-outlined {
    font-size: 18px;
  }
  .toggle-btn.active {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }

  /* ── Loading / Empty ── */
  .loading-row {
    padding: 8px 0;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 0;
    color: var(--md-sys-color-on-surface-variant);
  }
  .empty-state .material-symbols-outlined {
    font-size: 40px;
    opacity: 0.5;
  }
  .empty-state p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
  }

  /* ── Events List ── */
  .events-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ── Article Pick List ── */
  .pick-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pick-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .pick-title-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 0;
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-body-medium-font);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick-title-btn:hover {
    color: var(--md-sys-color-primary);
  }

  /* ── Inline Analysis ── */
  .inline-analysis {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .analysis-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .analysis-stage {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-primary);
  }
  .analysis-title {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .analysis-eta {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ── Analysis Result ── */
  .analysis-result {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .result-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .result-icon {
    font-size: 20px;
  }
  .result-article-title {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .result-scores {
    display: flex;
    gap: 16px;
  }
  .score-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .score-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .score-value {
    font: var(--md-sys-typescale-title-medium-font);
    font-weight: 600;
  }
  .result-points {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: var(--md-sys-color-surface-container);
    border-radius: var(--md-sys-shape-corner-small);
  }
  .point {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.5;
  }

  /* ── Analysis Error ── */
  .analysis-error {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--md-sys-color-error);
    font: var(--md-sys-typescale-body-small-font);
  }
  .analysis-error .material-symbols-outlined {
    font-size: 20px;
  }

  /* ── Results List ── */
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
    font: var(--md-sys-typescale-label-medium-font);
    font-weight: 600;
    flex-shrink: 0;
  }
</style>
