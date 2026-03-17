<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import {
    getGroqApiKey, setGroqApiKey,
    getGroqModel, setGroqModel,
    isGroqConfigured, runGroqAnalysis
  } from '$lib/core/groq.js';
  import * as api from '$lib/core/api.js';
  import { getAuthToken, isAuthenticated } from '$lib/core/auth.js';
  import { getUserHash } from '$lib/core/auth.js';

  // ── State ──
  let apiKey = $state(getGroqApiKey() || '');
  let model = $state(getGroqModel());
  let events = $state([]);
  let eventsLoading = $state(false);

  // Cluster analysis state
  let running = $state(false);
  let currentCluster = $state(null);
  let currentArticle = $state(null);
  let clusterProgress = $state({});  // { [cluster_id]: { total, analyzed, results[] } }
  let logs = $state([]);
  let totalAnalyzed = $state(0);
  let totalSkipped = $state(0);
  let totalFailed = $state(0);
  let stopRequested = $state(false);

  const MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ];

  // ── Groq Config ──
  function saveConfig() {
    setGroqApiKey(apiKey.trim());
    setGroqModel(model);
    addLog('info', `API Key 已儲存, Model: ${model}`);
  }

  // ── Logging ──
  function addLog(type, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    logs = [{ time, type, message }, ...logs].slice(0, 200);
  }

  // ── Fetch Events ──
  async function loadEvents() {
    eventsLoading = true;
    try {
      const result = await api.fetchEvents({ page: 1, limit: 50 });
      if (result.success) {
        events = result.data?.items || result.data?.events || [];
        addLog('info', `載入 ${events.length} 個事件集群`);
      } else {
        addLog('error', `載入事件失敗: ${result.error?.type}`);
      }
    } catch (e) {
      addLog('error', `載入事件異常: ${e.message}`);
    } finally {
      eventsLoading = false;
    }
  }

  // ── Cluster Priority Algorithm ──
  function getClusterPriority() {
    const withProgress = events.map(ev => {
      const prog = clusterProgress[ev.cluster_id];
      const analyzed = prog?.analyzed || 0;
      const total = prog?.total || ev.article_count || 1;
      const rate = total > 0 ? analyzed / total : 0;
      return { ...ev, analyzed, total, rate };
    });

    // Tier 1: in-progress (0 < rate < 1), sorted by rate DESC then total ASC
    const inProgress = withProgress
      .filter(e => e.rate > 0 && e.rate < 1)
      .sort((a, b) => b.rate - a.rate || a.total - b.total);

    // Tier 2: not started (rate === 0), sorted by total ASC
    const notStarted = withProgress
      .filter(e => e.rate === 0)
      .sort((a, b) => a.total - b.total);

    // Within each tier, add randomization for multi-user conflict avoidance
    const shuffleTier = (arr) => {
      if (arr.length <= 1) return arr;
      // Group by same priority score, shuffle within group
      const groups = [];
      let current = [arr[0]];
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].rate === current[0].rate && arr[i].total === current[0].total) {
          current.push(arr[i]);
        } else {
          groups.push(current);
          current = [arr[i]];
        }
      }
      groups.push(current);
      return groups.flatMap(g => {
        // Fisher-Yates within group
        const copy = [...g];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      });
    };

    return [...shuffleTier(inProgress), ...shuffleTier(notStarted)];
  }

  // ── Search Articles for a Cluster ──
  async function getClusterArticles(cluster) {
    const result = await api.searchArticles(cluster.title);
    if (!result.success) return [];
    return result.data?.articles || result.data?.items || [];
  }

  // ── Shuffle Array (Fisher-Yates) ──
  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // ── Main Cluster Analysis Loop ──
  async function startClusterAnalysis() {
    if (running) return;
    if (!isGroqConfigured()) {
      addLog('error', '請先設定 Groq API Key');
      return;
    }

    running = true;
    stopRequested = false;
    totalAnalyzed = 0;
    totalSkipped = 0;
    totalFailed = 0;
    addLog('info', '開始集群優先分析...');

    try {
      // Load events if not loaded
      if (events.length === 0) await loadEvents();

      while (running && !stopRequested) {
        const priority = getClusterPriority();
        if (priority.length === 0) {
          addLog('info', '所有集群已分析完成！');
          break;
        }

        const cluster = priority[0];
        currentCluster = cluster;
        addLog('info', `分析集群: "${cluster.title}" (${cluster.analyzed || 0}/${cluster.total || cluster.article_count})`);

        // Search articles in this cluster
        const articles = await getClusterArticles(cluster);
        if (articles.length === 0) {
          addLog('warn', `集群 "${cluster.title}" 搜尋無結果，跳過`);
          // Mark as done to avoid infinite loop
          clusterProgress = {
            ...clusterProgress,
            [cluster.cluster_id]: { total: 0, analyzed: 0, results: [] }
          };
          continue;
        }

        // Initialize progress for this cluster
        const existingProgress = clusterProgress[cluster.cluster_id];
        const analyzedIds = new Set((existingProgress?.results || []).map(r => r.article_id));

        // Filter out already-analyzed articles + shuffle for conflict avoidance
        const candidates = shuffle(
          articles.filter(a => !analyzedIds.has(a.article_id) && !(a.analysis_count > 0))
        );

        if (candidates.length === 0) {
          addLog('info', `集群 "${cluster.title}" 全部已分析`);
          clusterProgress = {
            ...clusterProgress,
            [cluster.cluster_id]: {
              total: articles.length,
              analyzed: articles.length,
              results: existingProgress?.results || []
            }
          };
          continue;
        }

        clusterProgress = {
          ...clusterProgress,
          [cluster.cluster_id]: {
            total: articles.length,
            analyzed: analyzedIds.size,
            results: existingProgress?.results || []
          }
        };

        // Analyze each article in this cluster
        for (const article of candidates) {
          if (stopRequested) break;
          currentArticle = article;

          try {
            const startMs = Date.now();
            const result = await runGroqAnalysis(article, []);
            const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

            addLog('success',
              `✅ "${(article.title || '').slice(0, 30)}..." bs=${result.bias_score} cs=${result.controversy_score} (${elapsed}s)`
            );

            // Submit to backend
            const submitResult = await submitResult(article, result);
            if (submitResult === 'duplicate') {
              totalSkipped += 1;
              addLog('warn', `⏭ 已有人分析過，跳過`);
            } else if (submitResult === 'success') {
              totalAnalyzed += 1;
            } else {
              totalFailed += 1;
            }

            // Update cluster progress (immutable)
            const prev = clusterProgress[cluster.cluster_id] || { total: articles.length, analyzed: 0, results: [] };
            clusterProgress = {
              ...clusterProgress,
              [cluster.cluster_id]: {
                total: prev.total,
                analyzed: prev.analyzed + 1,
                results: [...prev.results, { article_id: article.article_id, ...result }]
              }
            };

          } catch (err) {
            totalFailed += 1;
            addLog('error', `❌ "${(article.title || '').slice(0, 30)}..." ${err.message}`);
          }

          // Brief delay between articles (Groq rate limit friendly)
          if (!stopRequested) await delay(500);
        }

        currentArticle = null;
      }
    } catch (e) {
      addLog('error', `分析迴圈異常: ${e.message}`);
    } finally {
      running = false;
      currentCluster = null;
      currentArticle = null;
      addLog('info', `分析結束: ${totalAnalyzed} 成功, ${totalSkipped} 跳過, ${totalFailed} 失敗`);
    }
  }

  async function submitResult(article, result) {
    if (!isAuthenticated()) return 'no_auth';

    const payload = {
      bias_score: result.bias_score,
      controversy_score: result.controversy_score,
      reasoning: result.reasoning || '',
      key_phrases: result.key_phrases || [],
      narrative_points: result.points || [],
      prompt_version: result.prompt_version || 'v3.0.0',
      analysis_duration_ms: result.latency_ms || 0,
      inference_mode: 'groq',
      user_hash: getUserHash() || ''
    };

    try {
      const resp = await api.submitAnalysisResult(article.article_id, payload, getAuthToken() || '');
      if (resp.success) return 'success';
      if (resp.error?.status === 409 || resp.error?.type === 'duplicate') return 'duplicate';
      if (resp.error?.status === 429) {
        addLog('error', '⚠ Rate limited! 等待 30s...');
        await delay(30000);
        return 'rate_limited';
      }
      return 'failed';
    } catch {
      return 'failed';
    }
  }

  function stopAnalysis() {
    stopRequested = true;
    addLog('info', '停止請求已發送，等待目前分析完成...');
  }

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Derived ──
  let completedClusters = $derived(
    Object.values(clusterProgress).filter(p => p.total > 0 && p.analyzed >= p.total).length
  );
  let totalClusters = $derived(events.length);

  // ── Init ──
  $effect(() => {
    untrack(() => loadEvents());
  });
</script>

<div class="dev-page">
  <h1 class="page-title">臨時測試空間</h1>
  <p class="page-subtitle">Groq API + 集群優先分析（驗證後刪除）</p>

  <!-- Groq Config -->
  <Card variant="filled">
    <div class="config-section">
      <h2>Groq 設定</h2>
      <div class="field">
        <label for="api-key">API Key</label>
        <input
          id="api-key"
          type="password"
          bind:value={apiKey}
          placeholder="gsk_..."
          class="text-input"
        />
      </div>
      <div class="field">
        <label for="model-select">Model</label>
        <select id="model-select" bind:value={model} class="text-input">
          {#each MODELS as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>
      <Button onclick={saveConfig}>儲存設定</Button>
      {#if isGroqConfigured()}
        <span class="status-ok">已設定</span>
      {:else}
        <span class="status-warn">未設定</span>
      {/if}
    </div>
  </Card>

  <!-- Controls -->
  <Card variant="filled">
    <div class="controls-section">
      <h2>集群分析</h2>
      <div class="controls-row">
        {#if !running}
          <Button onclick={startClusterAnalysis}>開始集群分析</Button>
        {:else}
          <Button onclick={stopAnalysis}>停止</Button>
        {/if}
        <Button onclick={loadEvents}>重新載入集群</Button>
      </div>

      {#if running}
        <div class="running-status">
          <ProgressIndicator type="linear" />
          <div class="status-line">
            集群: {completedClusters}/{totalClusters} |
            文章: {totalAnalyzed} 成功, {totalSkipped} 跳過, {totalFailed} 失敗
          </div>
          {#if currentCluster}
            <div class="status-line">
              目前集群: "{(currentCluster.title || '').slice(0, 40)}"
            </div>
          {/if}
          {#if currentArticle}
            <div class="status-line">
              分析中: "{(currentArticle.title || '').slice(0, 50)}"
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </Card>

  <!-- Cluster List -->
  <Card variant="filled">
    <div class="cluster-section">
      <h2>事件集群 ({events.length})</h2>
      {#if eventsLoading}
        <ProgressIndicator type="circular" />
      {:else}
        <div class="cluster-list">
          {#each events as ev (ev.cluster_id)}
            {@const prog = clusterProgress[ev.cluster_id]}
            {@const total = prog?.total || ev.article_count || 0}
            {@const analyzed = prog?.analyzed || 0}
            {@const rate = total > 0 ? Math.round(analyzed / total * 100) : 0}
            <div class="cluster-row" class:done={rate >= 100} class:active={currentCluster?.cluster_id === ev.cluster_id}>
              <div class="cluster-status">
                {#if rate >= 100}
                  <span class="material-symbols-outlined done-icon">check_circle</span>
                {:else if rate > 0}
                  <span class="material-symbols-outlined progress-icon">pending</span>
                {:else}
                  <span class="material-symbols-outlined wait-icon">hourglass_empty</span>
                {/if}
              </div>
              <div class="cluster-info">
                <div class="cluster-title">{ev.title || '(無標題)'}</div>
                <div class="cluster-meta">
                  {analyzed}/{total} 篇 ({rate}%)
                  {#if ev.source_count}| {ev.source_count} 來源{/if}
                </div>
                {#if rate > 0 && rate < 100}
                  <div class="mini-progress">
                    <div class="mini-bar" style="width: {rate}%"></div>
                  </div>
                {/if}
                {#if prog?.results?.length > 0}
                  {@const avgBias = Math.round(prog.results.reduce((s, r) => s + (r.bias_score || 50), 0) / prog.results.length)}
                  {@const avgControversy = Math.round(prog.results.reduce((s, r) => s + (r.controversy_score || 0), 0) / prog.results.length)}
                  {@const campTotals = prog.results.reduce((acc, r) => {
                    if (r.camp_ratio) {
                      acc.green += r.camp_ratio.green || 0;
                      acc.white += r.camp_ratio.white || 0;
                      acc.blue += r.camp_ratio.blue || 0;
                    }
                    return acc;
                  }, { green: 0, white: 0, blue: 0 })}
                  <div class="cluster-stats">
                    <span>平均 bias={avgBias} controversy={avgControversy}</span>
                  </div>
                  {#if campTotals.green + campTotals.white + campTotals.blue > 0}
                    <div class="mini-camp">
                      <CampBar
                        green={campTotals.green}
                        white={campTotals.white}
                        blue={campTotals.blue}
                      />
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Card>

  <!-- Logs -->
  <Card variant="filled">
    <div class="log-section">
      <h2>分析紀錄</h2>
      <div class="log-list">
        {#each logs as log}
          <div class="log-entry" class:log-error={log.type === 'error'} class:log-success={log.type === 'success'} class:log-warn={log.type === 'warn'}>
            <span class="log-time">{log.time}</span>
            <span class="log-msg">{log.message}</span>
          </div>
        {/each}
        {#if logs.length === 0}
          <p class="log-empty">尚無紀錄</p>
        {/if}
      </div>
    </div>
  </Card>
</div>

<style>
  .dev-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
  }
  .page-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .page-subtitle {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  h2 {
    margin: 0 0 12px 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }

  .config-section, .controls-section, .cluster-section, .log-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .text-input {
    padding: 8px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-body-medium-font);
  }
  .text-input:focus {
    outline: 2px solid var(--md-sys-color-primary);
    border-color: transparent;
  }
  .status-ok {
    color: var(--camp-green);
    font: var(--md-sys-typescale-label-medium-font);
  }
  .status-warn {
    color: var(--md-sys-color-error);
    font: var(--md-sys-typescale-label-medium-font);
  }

  .controls-row {
    display: flex;
    gap: 8px;
  }
  .running-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
  }
  .status-line {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  .cluster-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 500px;
    overflow-y: auto;
  }
  .cluster-row {
    display: flex;
    gap: 8px;
    padding: 8px;
    border-radius: var(--md-sys-shape-corner-small);
    align-items: flex-start;
  }
  .cluster-row.active {
    background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
  }
  .cluster-row.done {
    opacity: 0.7;
  }
  .cluster-status {
    flex-shrink: 0;
    padding-top: 2px;
  }
  .done-icon { color: var(--camp-green); font-size: 20px; }
  .progress-icon { color: var(--md-sys-color-tertiary); font-size: 20px; }
  .wait-icon { color: var(--md-sys-color-outline); font-size: 20px; }
  .cluster-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cluster-title {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cluster-meta {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .cluster-stats {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-primary);
  }
  .mini-progress {
    height: 4px;
    background: var(--md-sys-color-surface-container-high);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 2px;
  }
  .mini-bar {
    height: 100%;
    background: var(--md-sys-color-primary);
    border-radius: 2px;
    transition: width 0.3s;
  }
  .mini-camp {
    margin-top: 4px;
    max-width: 200px;
  }

  .log-list {
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: monospace;
    font-size: 12px;
  }
  .log-entry {
    display: flex;
    gap: 8px;
    padding: 2px 4px;
    border-radius: 2px;
  }
  .log-time {
    color: var(--md-sys-color-outline);
    flex-shrink: 0;
  }
  .log-msg {
    color: var(--md-sys-color-on-surface);
    word-break: break-all;
  }
  .log-error .log-msg { color: var(--md-sys-color-error); }
  .log-success .log-msg { color: var(--camp-green); }
  .log-warn .log-msg { color: var(--md-sys-color-tertiary); }
  .log-empty {
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-body-small-font);
  }
</style>
