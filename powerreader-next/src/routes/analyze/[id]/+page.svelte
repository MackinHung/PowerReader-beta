<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import AnalysisResult from '$lib/components/analysis/AnalysisResult.svelte';
  import TransparencyPanel from '$lib/components/analysis/TransparencyPanel.svelte';
  import { getArticlesStore } from '$lib/stores/articles.svelte.js';
  import { getAnalysisStore } from '$lib/stores/analysis.svelte.js';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import * as api from '$lib/core/api.js';
  import { getAuthToken } from '$lib/core/auth.js';

  const articlesStore = getArticlesStore();
  const analysisStore = getAnalysisStore();
  const authStore = getAuthStore();

  let articleId = $derived(page.params.id);
  let article = $state(null);
  let result = $state(null);
  let loadError = $state(null);
  let analysisError = $state(null);

  const STEPS = [
    { key: 'preparing', label: '1. 檢查', icon: 'checklist' },
    { key: 'loading_model', label: '2. 載入模型', icon: 'download' },
    { key: 'analyzing', label: '3. 分析中', icon: 'psychology' },
    { key: 'done', label: '4. 完成', icon: 'check_circle' }
  ];

  let currentStepIndex = $derived(
    STEPS.findIndex(s => s.key === (analysisStore.analysisStage || 'preparing'))
  );

  $effect(() => {
    const id = articleId;
    untrack(() => loadArticle(id));
  });

  $effect(() => {
    const cleanup = analysisStore.init();
    return cleanup;
  });

  async function loadArticle(id) {
    loadError = null;
    const cached = articlesStore.getArticle(id);
    if (cached) {
      article = cached;
      return;
    }
    try {
      const res = await api.fetchArticle(id);
      if (res.success) {
        article = res.data;
      } else {
        loadError = res.error?.message || '無法載入文章';
      }
    } catch (e) {
      loadError = e.message;
    }
  }

  let showLoginPrompt = $state(false);

  function redirectToLogin() {
    const apiOrigin = new URL(api.API_BASE).origin;
    const callbackUrl = `${window.location.origin}/auth/callback`;
    window.location.href = `${apiOrigin}/api/v1/auth/google?redirect=${encodeURIComponent(callbackUrl)}`;
  }

  async function startAnalysis() {
    if (!article) return;
    if (!authStore.isAuthenticated) {
      showLoginPrompt = true;
      return;
    }
    analysisError = null;
    try {
      result = await analysisStore.analyze(articleId, article);
    } catch (e) {
      analysisError = e.message;
    }
  }

  async function handleSubmit() {
    if (!result) return;
    if (!authStore.isAuthenticated) {
      showLoginPrompt = true;
      return;
    }
    try {
      const token = getAuthToken();
      await api.submitAnalysisResult(articleId, result, token);
      goto(`/article/${articleId}`);
    } catch (e) {
      analysisError = e.message;
    }
  }

  function handleDiscard() {
    result = null;
    analysisError = null;
  }
</script>

<div class="analyze-detail-page">
  {#if showLoginPrompt && !authStore.isAuthenticated}
    <Card variant="elevated">
      <div class="login-prompt">
        <span class="material-symbols-outlined login-icon">login</span>
        <h3>請先登入</h3>
        <p>登入後才能進行 AI 分析</p>
        <div class="login-actions">
          <Button onclick={redirectToLogin}>
            <span class="material-symbols-outlined">account_circle</span>
            使用 Google 登入
          </Button>
          <Button variant="text" onclick={() => showLoginPrompt = false}>稍後再說</Button>
        </div>
      </div>
    </Card>
  {/if}

  {#if loadError}
    <div class="center-state">
      <span class="material-symbols-outlined error-icon">error</span>
      <p>{loadError}</p>
      <Button variant="outlined" onclick={() => loadArticle(articleId)}>重試</Button>
    </div>
  {:else if article}
    <Card variant="filled">
      <div class="article-summary">
        <h3>{article.title}</h3>
        <span class="source-label">{article.source}</span>
      </div>
    </Card>

    <!-- Step indicator -->
    <div class="step-indicator">
      {#each STEPS as step, i}
        <div class="step" class:active={i === currentStepIndex} class:done={i < currentStepIndex || result}>
          <span class="material-symbols-outlined step-icon">
            {i < currentStepIndex || result ? 'check_circle' : step.icon}
          </span>
          <span class="step-label">{step.label}</span>
        </div>
        {#if i < STEPS.length - 1}
          <div class="step-line" class:filled={i < currentStepIndex || result}></div>
        {/if}
      {/each}
    </div>

    {#if !result && !analysisStore.analysisStage}
      <div class="start-section">
        <Button onclick={startAnalysis}>
          <span class="material-symbols-outlined">psychology</span>
          開始分析
        </Button>
      </div>
    {/if}

    {#if analysisStore.analysisStage && !result}
      <div class="progress-section">
        <ProgressIndicator type="circular" />
        <p class="progress-text">
          {analysisStore.analysisStage === 'preparing' ? '準備中...' :
           analysisStore.analysisStage === 'loading_model' ? '載入模型中...' :
           analysisStore.analysisStage === 'analyzing' ? 'AI 分析中...' : '處理中...'}
        </p>
      </div>
    {/if}

    {#if analysisError}
      <Card variant="filled">
        <div class="error-msg">
          <span class="material-symbols-outlined">warning</span>
          <p>{analysisError}</p>
          <Button variant="outlined" onclick={startAnalysis}>重試</Button>
        </div>
      </Card>
    {/if}

    {#if result}
      <AnalysisResult {result} articleTitle={article?.title ?? ''} articleSource={article?.source ?? ''} onsubmit={handleSubmit} ondiscard={handleDiscard} />
      <TransparencyPanel details={result.transparency || {}} />
    {/if}
  {:else}
    <div class="center-state">
      <ProgressIndicator type="circular" />
    </div>
  {/if}
</div>

<style>
  .analyze-detail-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: var(--pr-page-padding, 16px);
  }
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    gap: 16px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .error-icon {
    font-size: 48px;
    color: var(--md-sys-color-error);
  }
  .article-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .article-summary h3 {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
  }
  .source-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .step-indicator {
    display: flex;
    align-items: center;
    padding: 8px 0;
    gap: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .step-icon {
    font-size: 24px;
    color: var(--md-sys-color-outline);
  }
  .step.active .step-icon {
    color: var(--md-sys-color-primary);
  }
  .step.done .step-icon {
    color: var(--camp-green, #4CAF50);
  }
  .step-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
  }
  .step.active .step-label {
    color: var(--md-sys-color-primary);
    font-weight: 600;
  }
  .step-line {
    flex: 1;
    height: 2px;
    background: var(--md-sys-color-outline-variant);
    margin: 0 4px;
    margin-bottom: 20px;
  }
  .step-line.filled {
    background: var(--camp-green, #4CAF50);
  }
  .start-section {
    display: flex;
    justify-content: center;
    padding: 16px;
  }
  .progress-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
  }
  .progress-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .error-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--md-sys-color-error);
  }
  .error-msg p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
  }
  .login-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    padding: 8px 0;
  }
  .login-prompt h3 {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .login-prompt p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .login-icon {
    font-size: 40px;
    color: var(--md-sys-color-primary);
  }
  .login-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }
</style>
