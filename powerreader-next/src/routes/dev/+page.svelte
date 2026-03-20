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

  import { t } from '$lib/i18n/zh-TW.js';

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
              `✅ "${(article.title || '').slice(0, 30)}..." bs=${result.bias_score} ei=${result.emotion_intensity} (${elapsed}s)`
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
      reasoning: result.reasoning || '',
      key_phrases: result.key_phrases || [],
      narrative_points: result.points || [],
      prompt_version: result.prompt_version || 'v4.2.0',
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

  // ── Knowledge Admin State ──
  let adminApiKey = $state(typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pr_admin_key') || '' : '');
  let knowledgeEntries = $state([]);
  let knowledgeLoading = $state(false);
  let knowledgePagination = $state({ page: 1, total: 0, total_pages: 0 });
  let knowledgeTypeFilter = $state('');
  let knowledgePartyFilter = $state('');
  let knowledgeMsg = $state({ text: '', type: '' });
  let showKnowledgeForm = $state(false);
  let editingEntry = $state(null);
  let knowledgeForm = $state({ id: '', type: 'politician', title: '', content: '', party: '' });
  let knowledgeSaving = $state(false);
  let deleteConfirmId = $state(null);

  const KNOWLEDGE_TYPES = ['figure', 'issue', 'incident'];
  const KNOWLEDGE_PARTIES = ['', 'KMT', 'DPP', 'TPP', 'NPP', 'TSP'];

  function saveAdminKey() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('pr_admin_key', adminApiKey.trim());
    }
  }

  async function loadKnowledgeList(page = 1) {
    if (!adminApiKey.trim()) {
      knowledgeMsg = { text: 'Please enter Admin API Key', type: 'error' };
      return;
    }
    knowledgeLoading = true;
    knowledgeMsg = { text: '', type: '' };
    try {
      const opts = { page, limit: 20 };
      if (knowledgeTypeFilter) opts.type = knowledgeTypeFilter;
      if (knowledgePartyFilter) opts.party = knowledgePartyFilter;
      const result = await api.fetchKnowledgeList(adminApiKey.trim(), opts);
      if (result.success) {
        knowledgeEntries = result.data?.entries || [];
        knowledgePagination = result.data?.pagination || { page, total: 0, total_pages: 0 };
      } else {
        knowledgeMsg = { text: `Error: ${result.error?.type || 'unknown'}`, type: 'error' };
      }
    } catch (e) {
      knowledgeMsg = { text: e.message, type: 'error' };
    } finally {
      knowledgeLoading = false;
    }
  }

  function openAddForm() {
    editingEntry = null;
    knowledgeForm = { id: '', type: 'politician', title: '', content: '', party: '' };
    showKnowledgeForm = true;
  }

  function openEditForm(entry) {
    editingEntry = entry;
    knowledgeForm = {
      id: entry.id,
      type: entry.type || 'politician',
      title: entry.title || '',
      content: entry.content || '',
      party: entry.party || ''
    };
    showKnowledgeForm = true;
    // If editing, fetch full content from search
    if (!entry.content) {
      api.searchKnowledgeEntries(adminApiKey.trim(), entry.title, { topK: 1 })
        .then(result => {
          const match = result.data?.results?.find(r => r.id === entry.id);
          if (match?.content) {
            knowledgeForm = { ...knowledgeForm, content: match.content };
          }
        })
        .catch(() => {});
    }
  }

  function closeForm() {
    showKnowledgeForm = false;
    editingEntry = null;
  }

  async function saveKnowledgeEntry() {
    if (!knowledgeForm.title.trim() || !knowledgeForm.content.trim()) {
      knowledgeMsg = { text: 'Title and content are required', type: 'error' };
      return;
    }
    knowledgeSaving = true;
    knowledgeMsg = { text: '', type: '' };
    try {
      const entry = {
        id: knowledgeForm.id || `${knowledgeForm.type.slice(0, 3)}_${Date.now().toString(16)}`,
        type: knowledgeForm.type,
        title: knowledgeForm.title.trim(),
        content: knowledgeForm.content.trim(),
        party: knowledgeForm.party || null
      };
      const result = await api.upsertKnowledgeEntry(adminApiKey.trim(), entry);
      if (result.success) {
        knowledgeMsg = { text: t('knowledge.admin.success'), type: 'success' };
        closeForm();
        await loadKnowledgeList(knowledgePagination.page);
      } else {
        knowledgeMsg = { text: `${t('knowledge.admin.error')}: ${result.error?.message || result.error?.type}`, type: 'error' };
      }
    } catch (e) {
      knowledgeMsg = { text: e.message, type: 'error' };
    } finally {
      knowledgeSaving = false;
    }
  }

  async function confirmDelete(id) {
    knowledgeMsg = { text: '', type: '' };
    try {
      const result = await api.deleteKnowledgeEntry(adminApiKey.trim(), id);
      if (result.success) {
        knowledgeMsg = { text: t('knowledge.admin.success'), type: 'success' };
        deleteConfirmId = null;
        await loadKnowledgeList(knowledgePagination.page);
      } else {
        knowledgeMsg = { text: `${t('knowledge.admin.error')}: ${result.error?.message || result.error?.type}`, type: 'error' };
      }
    } catch (e) {
      knowledgeMsg = { text: e.message, type: 'error' };
    }
  }

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
                  {@const campTotals = prog.results.reduce((acc, r) => {
                    if (r.camp_ratio) {
                      acc.green += r.camp_ratio.green || 0;
                      acc.white += r.camp_ratio.white || 0;
                      acc.blue += r.camp_ratio.blue || 0;
                    }
                    return acc;
                  }, { green: 0, white: 0, blue: 0 })}
                  <div class="cluster-stats">
                    <span>平均 bias={avgBias}</span>
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

  <!-- ═══════════════════════════════════════════════ -->
  <!-- Knowledge Admin Section                        -->
  <!-- ═══════════════════════════════════════════════ -->
  <Card variant="filled">
    <div class="config-section">
      <h2>{t('knowledge.admin.title')}</h2>
      <div class="field">
        <label for="admin-key">{t('knowledge.admin.api_key')}</label>
        <input
          id="admin-key"
          type="password"
          bind:value={adminApiKey}
          oninput={saveAdminKey}
          placeholder={t('knowledge.admin.api_key_placeholder')}
          class="text-input"
        />
      </div>

      <div class="controls-row">
        <Button onclick={() => loadKnowledgeList(1)}>{t('knowledge.admin.load_list')}</Button>
        <Button onclick={openAddForm}>{t('knowledge.admin.add')}</Button>
      </div>

      {#if knowledgeMsg.text}
        <div class="knowledge-msg" class:msg-error={knowledgeMsg.type === 'error'} class:msg-success={knowledgeMsg.type === 'success'}>
          {knowledgeMsg.text}
        </div>
      {/if}

      <!-- Type / Party Filter -->
      <div class="filter-row">
        <select bind:value={knowledgeTypeFilter} class="text-input filter-select" onchange={() => loadKnowledgeList(1)}>
          <option value="">All Types</option>
          {#each KNOWLEDGE_TYPES as kt}
            <option value={kt}>{t(`knowledge.type.${kt}`)}</option>
          {/each}
        </select>
        <select bind:value={knowledgePartyFilter} class="text-input filter-select" onchange={() => loadKnowledgeList(1)}>
          <option value="">All Parties</option>
          {#each KNOWLEDGE_PARTIES.filter(p => p) as kp}
            <option value={kp}>{t(`knowledge.party.${kp}`)}</option>
          {/each}
        </select>
      </div>

      <!-- Knowledge Table -->
      {#if knowledgeLoading}
        <ProgressIndicator type="circular" />
      {:else if knowledgeEntries.length > 0}
        <div class="knowledge-table-wrap">
          <table class="knowledge-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('knowledge.admin.form.type')}</th>
                <th>{t('knowledge.admin.form.title')}</th>
                <th>{t('knowledge.admin.form.party')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each knowledgeEntries as ke (ke.id)}
                <tr>
                  <td class="cell-id">{ke.id}</td>
                  <td>{t(`knowledge.type.${ke.type}`) || ke.type}</td>
                  <td class="cell-title">{ke.title}</td>
                  <td>{ke.party ? t(`knowledge.party.${ke.party}`) || ke.party : '-'}</td>
                  <td class="cell-actions">
                    <button class="icon-btn" onclick={() => openEditForm(ke)} title={t('knowledge.admin.edit')}>
                      <span class="material-symbols-outlined">edit</span>
                    </button>
                    {#if deleteConfirmId === ke.id}
                      <button class="icon-btn danger" onclick={() => confirmDelete(ke.id)} title="Confirm">
                        <span class="material-symbols-outlined">check</span>
                      </button>
                      <button class="icon-btn" onclick={() => { deleteConfirmId = null; }} title="Cancel">
                        <span class="material-symbols-outlined">close</span>
                      </button>
                    {:else}
                      <button class="icon-btn danger" onclick={() => { deleteConfirmId = ke.id; }} title={t('knowledge.admin.delete')}>
                        <span class="material-symbols-outlined">delete</span>
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if knowledgePagination.total_pages > 1}
          <div class="pagination-row">
            <button
              class="page-btn"
              disabled={knowledgePagination.page <= 1}
              onclick={() => loadKnowledgeList(knowledgePagination.page - 1)}
            >Prev</button>
            <span class="page-info">
              {knowledgePagination.page} / {knowledgePagination.total_pages}
              ({knowledgePagination.total} total)
            </span>
            <button
              class="page-btn"
              disabled={knowledgePagination.page >= knowledgePagination.total_pages}
              onclick={() => loadKnowledgeList(knowledgePagination.page + 1)}
            >Next</button>
          </div>
        {/if}
      {:else}
        <p class="log-empty">No entries loaded</p>
      {/if}
    </div>
  </Card>

  <!-- Knowledge Add/Edit Dialog -->
  {#if showKnowledgeForm}
    <div class="dialog-overlay" onclick={closeForm} role="presentation">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="dialog-content" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{editingEntry ? t('knowledge.admin.edit') : t('knowledge.admin.add')}</h3>
        <div class="form-fields">
          <div class="field">
            <label for="ke-id">{t('knowledge.admin.form.id')}</label>
            <input id="ke-id" class="text-input" bind:value={knowledgeForm.id}
              placeholder="auto-generated if empty" disabled={!!editingEntry} />
          </div>
          <div class="field">
            <label for="ke-type">{t('knowledge.admin.form.type')}</label>
            <select id="ke-type" class="text-input" bind:value={knowledgeForm.type}>
              {#each KNOWLEDGE_TYPES as kt}
                <option value={kt}>{t(`knowledge.type.${kt}`)}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="ke-title">{t('knowledge.admin.form.title')}</label>
            <input id="ke-title" class="text-input" bind:value={knowledgeForm.title} />
          </div>
          <div class="field">
            <label for="ke-content">{t('knowledge.admin.form.content')}</label>
            <textarea id="ke-content" class="text-input textarea" bind:value={knowledgeForm.content} rows="6"></textarea>
          </div>
          <div class="field">
            <label for="ke-party">{t('knowledge.admin.form.party')}</label>
            <select id="ke-party" class="text-input" bind:value={knowledgeForm.party}>
              <option value="">{t('knowledge.admin.form.party_none')}</option>
              {#each KNOWLEDGE_PARTIES.filter(p => p) as kp}
                <option value={kp}>{t(`knowledge.party.${kp}`)}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="dialog-actions">
          <Button onclick={closeForm}>{t('common.button.cancel')}</Button>
          <Button onclick={saveKnowledgeEntry} disabled={knowledgeSaving}>
            {knowledgeSaving ? t('common.label.loading') : t('knowledge.admin.save')}
          </Button>
        </div>
      </div>
    </div>
  {/if}

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

  /* Knowledge Admin */
  .knowledge-msg {
    padding: 8px 12px;
    border-radius: var(--md-sys-shape-corner-small);
    font: var(--md-sys-typescale-body-small-font);
  }
  .msg-error {
    background: color-mix(in srgb, var(--md-sys-color-error) 12%, transparent);
    color: var(--md-sys-color-error);
  }
  .msg-success {
    background: color-mix(in srgb, var(--camp-green, #4caf50) 12%, transparent);
    color: var(--camp-green, #4caf50);
  }
  .filter-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filter-select {
    flex: 1;
    min-width: 120px;
  }
  .knowledge-table-wrap {
    overflow-x: auto;
    max-height: 500px;
    overflow-y: auto;
  }
  .knowledge-table {
    width: 100%;
    border-collapse: collapse;
    font: var(--md-sys-typescale-body-small-font);
  }
  .knowledge-table th, .knowledge-table td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .knowledge-table th {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    position: sticky;
    top: 0;
    background: var(--md-sys-color-surface-container);
  }
  .cell-id {
    font-family: monospace;
    font-size: 11px;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-title {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-actions {
    display: flex;
    gap: 2px;
    white-space: nowrap;
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 50%;
    color: var(--md-sys-color-on-surface-variant);
  }
  .icon-btn:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .icon-btn.danger {
    color: var(--md-sys-color-error);
  }
  .icon-btn .material-symbols-outlined {
    font-size: 18px;
  }
  .pagination-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 0;
  }
  .page-btn {
    padding: 4px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-primary);
    cursor: pointer;
    font: var(--md-sys-typescale-label-medium-font);
  }
  .page-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .page-info {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Dialog */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    padding: 16px;
  }
  .dialog-content {
    background: var(--md-sys-color-surface);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    padding: 24px;
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .dialog-content h3 {
    margin: 0;
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
  }
  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .textarea {
    resize: vertical;
    min-height: 100px;
    font-family: inherit;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
