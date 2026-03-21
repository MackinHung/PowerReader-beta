<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import List from '$lib/components/ui/List.svelte';
  import ListItem from '$lib/components/ui/ListItem.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import { goto } from '$app/navigation';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import * as api from '$lib/core/api.js';
  import { getWebLLMEngine, clearAllModelCaches, hasWebGPU, detectBestMode, INFERENCE_MODES } from '$lib/core/inference.js';
  import { scanGPU, getCachedBenchmark, clearBenchmark, saveUserGPUSelection, getUserGPUSelection, getDeviceTier, getTimeoutForTier } from '$lib/core/benchmark.js';
  import { isModelDownloaded } from '$lib/core/manager.js';

  const authStore = getAuthStore();

  // ── Analysis settings ──
  let autoMode = $state(false);
  let autoSubmit = $state(false);
  let notifications = $state(true);
  let cacheEnabled = $state(true);

  // ── Three-gate confirmations (all required before auto-analysis) ──
  let consentAnalysis = $state(false);   // 同意分析模式
  let confirmModel = $state(false);      // 確認模型下載完成
  let confirmGpu = $state(false);        // GPU 條件確認

  // ── Model download state ──
  let modelReady = $state(false);
  let modelLoading = $state(false);
  let modelProgress = $state(0);       // 0.0-1.0
  let modelStageText = $state('');      // WebLLM progress text
  let modelError = $state('');
  let downloadStartTime = $state(0);
  let downloadSpeed = $state('');       // e.g. "12.3 MB/s"
  let downloadEta = $state('');         // e.g. "2:30"

  // EMA smoothing state for stable ETA
  let smoothedSpeed = 0;               // EMA of progress/s
  let smoothedEta = 0;                 // EMA of remaining seconds
  const SPEED_ALPHA = 0.7;             // speed smoothing (responsive)
  const ETA_ALPHA = 0.9;               // ETA smoothing (stable)
  const ESTIMATED_MB = 4500;           // ~4.5GB for Qwen3-8B

  // ── GPU detection state ──
  let gpuResult = $state(null);         // scanGPU() result
  let gpuScanning = $state(false);
  let webgpuSupported = $state(false);

  // ── Device tier (VRAM-based) ──
  let deviceTier = $state('cpu');

  // ── GPU manual selection ──
  let showGpuPicker = $state(false);
  let selectedGpu = $state('');
  let userOverride = $state(null);      // getUserGPUSelection()

  // ── Inference mode ──
  let inferenceMode = $state('');

  // ── Cache ──
  let cacheSize = $state('計算中...');

  // ── Account management ──
  let showDeleteDialog = $state(false);
  let deleteConfirmText = $state('');
  let deleteLoading = $state(false);
  let exportLoading = $state(false);

  // ── Common GPU list for manual selection ──
  const GPU_OPTIONS = [
    { group: 'NVIDIA RTX 50', items: [
      { label: 'RTX 5090', vram: 32768 },
      { label: 'RTX 5080', vram: 16384 },
      { label: 'RTX 5070 Ti', vram: 16384 },
      { label: 'RTX 5070', vram: 12288 },
      { label: 'RTX 5060', vram: 8192 },
    ]},
    { group: 'NVIDIA RTX 40', items: [
      { label: 'RTX 4090', vram: 24576 },
      { label: 'RTX 4080', vram: 16384 },
      { label: 'RTX 4070 Ti', vram: 12288 },
      { label: 'RTX 4070', vram: 12288 },
      { label: 'RTX 4060 Ti', vram: 8192 },
      { label: 'RTX 4060', vram: 8192 },
    ]},
    { group: 'NVIDIA RTX 30', items: [
      { label: 'RTX 3090', vram: 24576 },
      { label: 'RTX 3080', vram: 10240 },
      { label: 'RTX 3070', vram: 8192 },
      { label: 'RTX 3060', vram: 12288 },
      { label: 'RTX 3050', vram: 8192 },
    ]},
    { group: 'NVIDIA RTX 20', items: [
      { label: 'RTX 2080 Ti', vram: 11264 },
      { label: 'RTX 2070', vram: 8192 },
      { label: 'RTX 2060', vram: 6144 },
    ]},
    { group: 'NVIDIA GTX', items: [
      { label: 'GTX 1660 Ti', vram: 6144 },
      { label: 'GTX 1660', vram: 6144 },
      { label: 'GTX 1650', vram: 4096 },
      { label: 'GTX 1050 Ti', vram: 4096 },
    ]},
    { group: 'AMD Radeon', items: [
      { label: 'RX 7900 XTX', vram: 24576 },
      { label: 'RX 7800 XT', vram: 16384 },
      { label: 'RX 7600', vram: 8192 },
      { label: 'RX 6800 XT', vram: 16384 },
      { label: 'RX 6700 XT', vram: 12288 },
      { label: 'RX 6600', vram: 8192 },
    ]},
    { group: 'Apple Silicon', items: [
      { label: 'M4 Pro / Max', vram: 24576 },
      { label: 'M4', vram: 16384 },
      { label: 'M3 Pro / Max', vram: 18432 },
      { label: 'M3', vram: 8192 },
      { label: 'M2 Pro / Max', vram: 16384 },
      { label: 'M2', vram: 8192 },
      { label: 'M1 Pro / Max', vram: 16384 },
      { label: 'M1', vram: 8192 },
    ]},
    { group: 'Intel', items: [
      { label: 'Arc A770', vram: 16384 },
      { label: 'Arc A750', vram: 8192 },
      { label: 'Iris Xe (內顯)', vram: 2048 },
    ]},
  ];

  // ── Init ──
  let initialized = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    untrack(() => initSettings());
  });

  /** Check if WebLLM model is actually cached in Cache API */
  async function checkWebLLMCacheExists() {
    try {
      if (typeof caches === 'undefined') return false;
      const names = await caches.keys();
      // WebLLM cache names contain 'webllm' or model patterns
      const webllmCache = names.find(n =>
        n.includes('webllm') || n.includes('mlc') || n.includes('Qwen')
      );
      if (!webllmCache) return false;
      const cache = await caches.open(webllmCache);
      const keys = await cache.keys();
      // Need at least a few entries (WASM + params) to be considered downloaded
      return keys.length >= 2;
    } catch {
      return false;
    }
  }

  async function initSettings() {
    // Load saved settings
    autoMode = localStorage.getItem('analysis_mode') === 'auto';
    autoSubmit = localStorage.getItem('auto_submit') === 'true';
    notifications = localStorage.getItem('notifications') !== 'false';
    cacheEnabled = localStorage.getItem('cache_enabled') !== 'false';

    // Three-gate confirmations
    consentAnalysis = localStorage.getItem('pr_consent_analysis') === '1';
    confirmModel = localStorage.getItem('pr_confirm_model') === '1';
    confirmGpu = localStorage.getItem('pr_confirm_gpu') === '1';

    // Model status — check actual WebLLM caches in Cache API
    modelReady = await checkWebLLMCacheExists();

    // GPU: load user override + device tier
    userOverride = getUserGPUSelection();
    deviceTier = getDeviceTier();

    // GPU: live scan
    gpuScanning = true;
    try {
      gpuResult = await scanGPU();
      webgpuSupported = gpuResult.supported;
    } catch {
      gpuResult = null;
      webgpuSupported = false;
    }
    gpuScanning = false;

    // Inference mode
    inferenceMode = await detectBestMode().catch(() => INFERENCE_MODES.SERVER);

    // Cache size
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      cacheSize = `${((est.usage || 0) / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      cacheSize = '無法計算';
    }

    queueMicrotask(() => { initialized = true; });
  }

  // Persist settings
  $effect(() => {
    if (!initialized || typeof window === 'undefined') return;
    localStorage.setItem('analysis_mode', autoMode ? 'auto' : 'manual');
    localStorage.setItem('auto_submit', String(autoSubmit));
    localStorage.setItem('notifications', String(notifications));
    localStorage.setItem('cache_enabled', String(cacheEnabled));
    localStorage.setItem('pr_consent_analysis', consentAnalysis ? '1' : '0');
    localStorage.setItem('pr_confirm_model', confirmModel ? '1' : '0');
    localStorage.setItem('pr_confirm_gpu', confirmGpu ? '1' : '0');
  });

  // ── Model download ──
  async function handleDownloadModel() {
    modelLoading = true;
    modelError = '';
    modelProgress = 0;
    modelStageText = '正在初始化...';
    downloadSpeed = '';
    downloadEta = '';
    downloadStartTime = Date.now();
    smoothedSpeed = 0;
    smoothedEta = 0;
    let lastProgress = 0;
    let lastTime = Date.now();

    try {
      await getWebLLMEngine((report) => {
        const pct = report.progress || 0;
        modelProgress = pct;
        modelStageText = report.text || '';

        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt > 0.5 && pct > lastProgress) {
          const dp = pct - lastProgress;
          const instantSpeed = dp / dt;  // progress/s

          // EMA smoothing: speed (α=0.7 responsive), ETA (α=0.9 stable)
          smoothedSpeed = smoothedSpeed === 0
            ? instantSpeed
            : (1 - SPEED_ALPHA) * instantSpeed + SPEED_ALPHA * smoothedSpeed;

          const remaining = smoothedSpeed > 0 ? (1.0 - pct) / smoothedSpeed : 0;
          smoothedEta = smoothedEta === 0
            ? remaining
            : (1 - ETA_ALPHA) * remaining + ETA_ALPHA * smoothedEta;

          // Format speed
          const speedMB = smoothedSpeed * ESTIMATED_MB;
          downloadSpeed = speedMB >= 1
            ? `${speedMB.toFixed(1)} MB/s`
            : `${(speedMB * 1024).toFixed(0)} KB/s`;

          // Format ETA
          const eta = Math.max(0, smoothedEta);
          if (eta < 60) {
            downloadEta = `${Math.ceil(eta)} 秒`;
          } else if (eta < 3600) {
            const mins = Math.floor(eta / 60);
            const secs = Math.ceil(eta % 60);
            downloadEta = `${mins}:${String(secs).padStart(2, '0')}`;
          } else {
            const hrs = Math.floor(eta / 3600);
            const mins = Math.floor((eta % 3600) / 60);
            downloadEta = `${hrs}:${String(mins).padStart(2, '0')}:00`;
          }

          lastProgress = pct;
          lastTime = now;
        }
      });

      modelReady = true;
      modelProgress = 1;
      modelStageText = '下載完成';
      downloadSpeed = '';
      downloadEta = '';
    } catch (err) {
      modelError = err.message || '下載失敗';
      modelStageText = '';
    } finally {
      modelLoading = false;
    }
  }

  async function handleDeleteModel() {
    try {
      const freedMB = await clearAllModelCaches();
      try { localStorage.removeItem('powerreader_webllm_cached'); } catch {}
      modelReady = false;
      modelProgress = 0;
      modelStageText = freedMB > 0 ? `已釋放 ${freedMB} MB` : '已刪除';
    } catch (err) {
      modelError = `刪除失敗：${err.message || '未知錯誤'}`;
    }
  }

  // ── GPU manual selection ──
  function handleGpuSelect(e) {
    const val = e.target.value;
    if (!val) return;
    const [label, vramStr] = val.split('|');
    const vram = parseInt(vramStr, 10);
    saveUserGPUSelection(label, vram);
    userOverride = { device: label, vramMB: vram };
    selectedGpu = val;
    deviceTier = getDeviceTier();
  }

  // ── Cache ──
  async function handleClearCache() {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    cacheSize = '0 MB';
  }

  // ── Account management ──
  async function handleExportData() {
    exportLoading = true;
    try {
      const result = await api.exportUserData(authStore.token);
      if (result.success && result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `powerreader-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      exportLoading = false;
    }
  }

  function openDeleteDialog() {
    showDeleteDialog = true;
    deleteConfirmText = '';
  }

  function closeDeleteDialog() {
    showDeleteDialog = false;
    deleteConfirmText = '';
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== '刪除') return;
    deleteLoading = true;
    try {
      const result = await api.deleteUserAccount(authStore.token);
      if (result.success) {
        authStore.logout();
        goto('/');
      }
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      deleteLoading = false;
      showDeleteDialog = false;
    }
  }

  // ── Derived helpers (reactive) ──
  let gpuDisplayName = $derived.by(() => {
    if (userOverride) return `${userOverride.device} (${userOverride.vramMB} MB)`;
    if (gpuResult?.supported && gpuResult.device) return `${gpuResult.device} (${gpuResult.vramMB} MB)`;
    if (gpuResult?.supported) return `WebGPU 可用 (VRAM 未知)`;
    return 'WebGPU 不可用';
  });

  let vramMB = $derived(userOverride ? userOverride.vramMB : (gpuResult?.vramMB || 0));

  let vramVerdict = $derived.by(() => {
    if (vramMB === 0) return { icon: 'help', text: '無法判斷', color: 'var(--md-sys-color-on-surface-variant)' };
    if (vramMB >= 6144) return { icon: 'check_circle', text: '可運行本地推理', color: 'var(--md-sys-color-primary)' };
    if (vramMB >= 4096) return { icon: 'warning', text: '可能較慢', color: 'var(--md-sys-color-tertiary)' };
    return { icon: 'error', text: 'VRAM 不足，建議使用伺服器模式', color: 'var(--md-sys-color-error)' };
  });

  function getModeLabel(mode) {
    return mode === INFERENCE_MODES.WEBGPU ? 'WebGPU 本地推理' : '伺服器推理';
  }

  // ── Readiness: all 3 gates must pass ──
  let allGatesReady = $derived(consentAnalysis && confirmModel && confirmGpu);

  // If model is deleted, auto-revoke model confirmation
  $effect(() => {
    if (initialized && !modelReady) {
      confirmModel = false;
    }
  });
</script>

<div class="settings-page">
  <header class="page-header">
    <h1 class="page-title">設定</h1>
  </header>

  <!-- ═══ Analysis Settings ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">tune</span>
      分析設定
    </h2>
    <Card variant="filled">
      <List>
        <ListItem headline="分析模式" supporting={autoMode ? '自動' : '手動'}>
          {#snippet trailing()}
            <Switch bind:checked={autoMode} />
          {/snippet}
        </ListItem>
        <ListItem headline="自動提交結果" supporting="分析完成後自動提交">
          {#snippet trailing()}
            <Switch bind:checked={autoSubmit} />
          {/snippet}
        </ListItem>
        <ListItem headline="通知" supporting="接收分析完成通知">
          {#snippet trailing()}
            <Switch bind:checked={notifications} />
          {/snippet}
        </ListItem>
        <ListItem headline="快取" supporting="離線存取已載入內容">
          {#snippet trailing()}
            <Switch bind:checked={cacheEnabled} />
          {/snippet}
        </ListItem>
      </List>
      <!-- Gate 1: Consent -->
      <div class="gate-item" class:gate-checked={consentAnalysis}>
        <label class="gate-checkbox-row">
          <input type="checkbox" class="gate-checkbox" bind:checked={consentAnalysis} />
          <span class="gate-label">
            <span class="material-symbols-outlined gate-icon">{consentAnalysis ? 'check_circle' : 'radio_button_unchecked'}</span>
            同意分析模式
          </span>
        </label>
        <p class="gate-reason">
          自動分析會使用您的 GPU 在本機執行 AI 推理，過程中將消耗顯示卡資源與電力。啟用前請確認您已了解此運作方式，並同意將裝置算力貢獻於新聞偏見分析。
        </p>
      </div>
    </Card>
  </section>

  <!-- ═══ Model Management ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">smart_toy</span>
      模型管理
    </h2>
    <Card variant="filled">
      <div class="model-section">
        <!-- Header -->
        <div class="model-info">
          <span class="material-symbols-outlined model-icon">smart_toy</span>
          <div class="model-text">
            <span class="model-name">Qwen3-8B</span>
            <span class="model-size">~4.5 GB (WebGPU 4-bit 量化)</span>
          </div>
          {#if modelReady && !modelLoading}
            <span class="material-symbols-outlined model-check">check_circle</span>
          {/if}
        </div>

        <!-- Progress bar during download -->
        {#if modelLoading}
          <div class="download-progress">
            <div class="progress-header">
              <span class="progress-pct">{Math.round(modelProgress * 100)}%</span>
              {#if downloadSpeed}
                <span class="progress-speed">{downloadSpeed}</span>
              {/if}
              {#if downloadEta}
                <span class="progress-eta">剩餘 {downloadEta}</span>
              {/if}
            </div>
            <ProgressIndicator type="linear" value={modelProgress * 100} />
            {#if modelStageText}
              <span class="progress-stage">{modelStageText}</span>
            {/if}
          </div>
        {/if}

        <!-- Error -->
        {#if modelError}
          <div class="model-error">
            <span class="material-symbols-outlined">error</span>
            <span>{modelError}</span>
          </div>
        {/if}

        <!-- Status text when not downloading -->
        {#if !modelLoading && !modelError}
          <span class="model-status-text">
            {#if modelReady}
              已下載，可進行本地推理
            {:else}
              尚未下載，需要 Wi-Fi 和足夠儲存空間
            {/if}
          </span>
        {/if}

        <!-- Actions -->
        <div class="model-actions">
          {#if !modelReady && !modelLoading}
            <Button onclick={handleDownloadModel}>
              <span class="material-symbols-outlined">download</span>
              下載模型
            </Button>
          {:else if modelLoading}
            <Button variant="outlined" disabled>
              <span class="material-symbols-outlined">hourglass_top</span>
              下載中...
            </Button>
          {:else if modelReady}
            <Button variant="outlined" onclick={handleDeleteModel}>
              <span class="material-symbols-outlined">delete</span>
              刪除模型
            </Button>
          {/if}
        </div>

        <!-- Gate 2: Model downloaded confirmation -->
        <div class="gate-item" class:gate-checked={confirmModel} class:gate-disabled={!modelReady}>
          <label class="gate-checkbox-row">
            <input type="checkbox" class="gate-checkbox" bind:checked={confirmModel} disabled={!modelReady} />
            <span class="gate-label">
              <span class="material-symbols-outlined gate-icon">{confirmModel ? 'check_circle' : 'radio_button_unchecked'}</span>
              確認模型下載完成
            </span>
          </label>
          <p class="gate-reason">
            {#if modelReady}
              模型已下載至本機快取。請確認下載完整無誤，確保推理品質與分析結果的正確性。
            {:else}
              請先下載 AI 模型，才能啟用本地推理功能。模型未完整下載將導致分析失敗或產生錯誤結果。
            {/if}
          </p>
        </div>
      </div>
    </Card>
  </section>

  <!-- ═══ Hardware Detection ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">memory</span>
      硬體偵測
    </h2>
    <Card variant="filled">
      <div class="hardware-section">
        <!-- GPU Info -->
        <div class="hw-row">
          <span class="hw-label">GPU</span>
          <span class="hw-value">
            {#if gpuScanning}
              偵測中...
            {:else}
              {gpuDisplayName}
            {/if}
          </span>
        </div>

        <!-- (VRAM verdict shown in hardware guide below) -->

        <!-- GPU Type -->
        {#if gpuResult?.gpuType && gpuResult.gpuType !== 'unknown'}
          <div class="hw-row">
            <span class="hw-label">類型</span>
            <span class="hw-value">
              {gpuResult.gpuType === 'discrete' ? '獨立顯卡' : gpuResult.gpuType === 'integrated' ? '內建顯示' : gpuResult.gpuType === 'unified' ? '統一記憶體' : gpuResult.gpuType}
            </span>
          </div>
        {/if}

        <!-- Architecture -->
        {#if gpuResult?.architecture}
          <div class="hw-row">
            <span class="hw-label">架構</span>
            <span class="hw-value">{gpuResult.vendor} {gpuResult.architecture}</span>
          </div>
        {/if}

        <!-- Inference Mode -->
        <div class="hw-row">
          <span class="hw-label">推理模式</span>
          <span class="hw-value">{getModeLabel(inferenceMode)}</span>
        </div>

        <!-- Manual GPU Selection -->
        <div class="gpu-picker">
          <span class="gpu-picker-label">偵測不到 GPU？手動選擇：</span>
          <select class="gpu-select" value={selectedGpu} onchange={handleGpuSelect}>
            <option value="">-- 選擇你的 GPU --</option>
            {#each GPU_OPTIONS as group}
              <optgroup label={group.group}>
                {#each group.items as gpu}
                  <option value="{gpu.label}|{gpu.vram}">
                    {gpu.label} ({(gpu.vram / 1024).toFixed(0)} GB)
                  </option>
                {/each}
              </optgroup>
            {/each}
          </select>
          {#if userOverride}
            <span class="gpu-override-badge">
              手動選擇：{userOverride.device}
            </span>
          {/if}
        </div>

        <!-- Hardware Guide -->
        <div class="hw-guide">
          <span class="hw-guide-title">GPU 條件</span>
          <p class="hw-guide-desc">
            自動分析需使用裝置的 GPU 進行本地 AI 推理。執行前必須經由使用者確認硬體可用，確保裝置具備足夠的顯示卡記憶體 (VRAM) 以完成推理工作。目前不支援手機版本 — 行動裝置的 GPU 效能不足以執行大型語言模型推理，且會造成裝置過熱與耗電問題。
          </p>
          <div class="hw-guide-tiers">
            <div class="hw-guide-tier">
              <span class="material-symbols-outlined" style="color: var(--md-sys-color-primary)">check_circle</span>
              <span>&ge; 6 GB &mdash; 推薦，可順暢運行本地推理</span>
            </div>
            <div class="hw-guide-tier">
              <span class="material-symbols-outlined" style="color: var(--md-sys-color-tertiary)">warning</span>
              <span>4~6 GB &mdash; 可運行但速度較慢</span>
            </div>
            <div class="hw-guide-tier">
              <span class="material-symbols-outlined" style="color: var(--md-sys-color-error)">error</span>
              <span>&lt; 4 GB &mdash; 不建議，請使用伺服器模式</span>
            </div>
          </div>
          <div class="hw-guide-how">
            <span class="hw-guide-how-title">
              <span class="material-symbols-outlined" style="font-size: 18px">lightbulb</span>
              查看方法
            </span>
            <div class="hw-guide-how-content">
              <div><strong>Windows:</strong> Ctrl+Shift+Esc &rarr; 效能 &rarr; GPU &rarr; 「專用 GPU 記憶體」即為 VRAM</div>
              <div><strong>macOS:</strong>  &rarr; 關於這台 Mac &rarr; 記憶體即共用 (Apple Silicon 為統一記憶體)</div>
            </div>
          </div>
          <div class="verdict-row" style:color={vramVerdict.color}>
            <span class="material-symbols-outlined verdict-icon">{vramVerdict.icon}</span>
            <span>目前狀態：{vramVerdict.text}{vramMB > 0 ? ` (${(vramMB / 1024).toFixed(0)} GB)` : ''}</span>
          </div>

          <!-- Gate 3: GPU confirmation -->
          <div class="gate-item" class:gate-checked={confirmGpu}>
            <label class="gate-checkbox-row">
              <input type="checkbox" class="gate-checkbox" bind:checked={confirmGpu} />
              <span class="gate-label">
                <span class="material-symbols-outlined gate-icon">{confirmGpu ? 'check_circle' : 'radio_button_unchecked'}</span>
                GPU 條件確認
              </span>
            </label>
            <p class="gate-reason">
              請確認您的裝置為桌上型電腦或筆記型電腦，且 GPU 具備足夠 VRAM（建議 6 GB 以上）。確認此項代表您已檢查硬體規格，並同意在此裝置上執行 AI 推理運算。
            </p>
          </div>
        </div>
      </div>
    </Card>
  </section>

  <!-- ═══ Analysis Readiness ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">verified</span>
      自動分析就緒狀態
    </h2>
    <Card variant="filled">
      <div class="readiness-section">
        <div class="readiness-row" class:ready={consentAnalysis}>
          <span class="material-symbols-outlined readiness-icon">{consentAnalysis ? 'check_circle' : 'cancel'}</span>
          <span>同意分析模式</span>
        </div>
        <div class="readiness-row" class:ready={confirmModel}>
          <span class="material-symbols-outlined readiness-icon">{confirmModel ? 'check_circle' : 'cancel'}</span>
          <span>模型下載確認</span>
        </div>
        <div class="readiness-row" class:ready={confirmGpu}>
          <span class="material-symbols-outlined readiness-icon">{confirmGpu ? 'check_circle' : 'cancel'}</span>
          <span>GPU 條件確認</span>
        </div>
        <div class="readiness-verdict" class:all-ready={allGatesReady}>
          {#if allGatesReady}
            <span class="material-symbols-outlined">rocket_launch</span>
            <span>所有條件已滿足，可以啟動自動分析</span>
          {:else}
            <span class="material-symbols-outlined">block</span>
            <span>尚有未完成的確認項目，無法啟動自動分析</span>
          {/if}
        </div>
      </div>
    </Card>
  </section>

  <!-- ═══ Cache Management ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">cached</span>
      快取管理
    </h2>
    <Card variant="filled">
      <List>
        <ListItem headline="快取大小" supporting={cacheSize}>
          {#snippet trailing()}
            <Button variant="text" onclick={handleClearCache}>清除</Button>
          {/snippet}
        </ListItem>
      </List>
    </Card>
  </section>

  <!-- ═══ Account Management ═══ -->
  {#if authStore.isAuthenticated}
    <section class="section">
      <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">manage_accounts</span>
      帳號管理
    </h2>
      <Card variant="filled">
        <div class="account-section">
          <Button variant="outlined" onclick={handleExportData} disabled={exportLoading}>
            <span class="material-symbols-outlined">download</span>
            {exportLoading ? '匯出中...' : '匯出我的資料'}
          </Button>
          <Button variant="text" onclick={openDeleteDialog}>
            <span class="material-symbols-outlined" style="color: var(--md-sys-color-error)">delete_forever</span>
            <span style="color: var(--md-sys-color-error)">刪除帳號</span>
          </Button>
        </div>
      </Card>
    </section>
  {/if}

  <!-- ═══ About ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">info</span>
      關於
    </h2>
    <Card variant="filled">
      <List>
        <ListItem headline="版本" supporting="PowerReader v2.6-next" />
        <ListItem headline="授權" supporting="AGPL-3.0" />
        <ListItem
          headline="原始碼"
          supporting="GitHub"
          onclick={() => window.open('https://github.com/MackinHung/powerreader', '_blank')}
        />
      </List>
    </Card>
  </section>
</div>

{#if showDeleteDialog}
  <div class="dialog-backdrop" onclick={closeDeleteDialog}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="dialog-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <h3 class="dialog-title">確認刪除帳號</h3>
      <p class="dialog-text">此操作不可逆。您的所有資料將被永久刪除。</p>
      <p class="dialog-text">請輸入「刪除」確認：</p>
      <input
        type="text"
        class="dialog-input"
        bind:value={deleteConfirmText}
        placeholder="刪除"
      />
      <div class="dialog-actions">
        <Button variant="text" onclick={closeDeleteDialog}>取消</Button>
        <Button
          variant="filled"
          onclick={handleDeleteAccount}
          disabled={deleteConfirmText !== '刪除' || deleteLoading}
        >
          {deleteLoading ? '處理中...' : '確認刪除'}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: var(--pr-page-gap);
    padding: var(--pr-page-padding);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .page-header {
    padding: 4px 0 12px;
  }
  .page-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
    padding-left: 16px;
    border-left: 5px solid #FF5722;
    letter-spacing: 0.01em;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
    border-left: 4px solid #FF5722;
  }
  .section-icon {
    font-size: 24px;
    color: #FF5722;
    flex-shrink: 0;
  }

  /* ── Account Section ── */
  .account-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    padding: 4px 0;
  }

  /* ── Dialog ── */
  .dialog-backdrop {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }
  .dialog-card {
    background: var(--md-sys-color-surface-container-high);
    border-radius: 0;
    border: 4px solid var(--pr-ink);
    box-shadow: 8px 8px 0px var(--pr-ink);
    padding: 24px;
    max-width: 400px;
    width: 90%;
    display: flex; flex-direction: column; gap: 12px;
  }
  .dialog-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .dialog-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .dialog-input {
    padding: 10px 12px;
    border: 2px solid var(--pr-ink);
    border-radius: 0;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-body-large-font);
    outline: none;
  }
  .dialog-input:focus { border-color: #FF5722; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

  /* ── Model Section ── */
  .model-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0;
  }
  .model-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .model-icon {
    font-size: 32px;
    color: var(--md-sys-color-primary);
  }
  .model-check {
    font-size: 24px;
    color: var(--md-sys-color-primary);
    margin-left: auto;
  }
  .model-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .model-name {
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 500;
  }
  .model-size {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .model-status-text {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    padding-left: 0;
  }
  .model-actions {
    display: flex;
    gap: 8px;
    padding-left: 0;
  }
  .model-error {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-error);
  }
  @media (min-width: 768px) {
    .model-status-text {
      padding-left: 44px;
    }
    .model-actions {
      padding-left: 44px;
    }
    .model-error {
      padding-left: 44px;
    }
  }
  .model-error .material-symbols-outlined {
    font-size: 18px;
  }

  /* ── Download Progress ── */
  .download-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
  }
  @media (min-width: 768px) {
    .download-progress {
      padding: 0 44px;
    }
  }
  .progress-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .progress-pct {
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-primary);
    font-weight: 600;
    min-width: 48px;
  }
  .progress-speed {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .progress-eta {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: auto;
  }
  .progress-stage {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Hardware Section ── */
  .hardware-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 0;
  }
  .hw-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 2px 0;
  }
  .hw-label {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-on-surface-variant);
    min-width: 72px;
    flex-shrink: 0;
  }
  .hw-value {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .verdict-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: var(--md-sys-shape-corner-small);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .verdict-icon {
    font-size: 20px;
  }
  .verdict-row > span:last-child {
    font: var(--md-sys-typescale-label-large-font);
  }

  /* ── GPU Picker ── */
  .gpu-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
  .gpu-picker-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .gpu-select {
    padding: 8px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-body-medium-font);
    outline: none;
    cursor: pointer;
    max-width: 100%;
  }
  @media (min-width: 768px) {
    .gpu-select {
      max-width: 400px;
    }
  }
  .gpu-select:focus {
    border-color: var(--md-sys-color-primary);
  }
  .gpu-override-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-primary);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-primary-container);
    align-self: flex-start;
  }

  /* ── Hardware Guide ── */
  .hw-guide {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
  .hw-guide-title {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 600;
  }
  .hw-guide-tiers {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hw-guide-tier {
    display: flex;
    align-items: center;
    gap: 6px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .hw-guide-tier .material-symbols-outlined {
    font-size: 18px;
  }
  .hw-guide-how {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: var(--md-sys-shape-corner-small);
    background: color-mix(in srgb, var(--md-sys-color-tertiary) 8%, transparent);
  }
  .hw-guide-how-title {
    display: flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-tertiary);
    font-weight: 600;
  }
  .hw-guide-how-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .hw-guide-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
  }

  /* ── Gate Confirmation Items ── */
  .gate-item {
    margin-top: 12px;
    padding: 12px;
    border: 2px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small);
    background: color-mix(in srgb, var(--md-sys-color-surface) 50%, transparent);
    transition: border-color 0.2s, background 0.2s;
  }
  .gate-item.gate-checked {
    border-color: var(--md-sys-color-primary);
    background: color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent);
  }
  .gate-item.gate-disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .gate-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .gate-checkbox {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .gate-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 600;
  }
  .gate-icon {
    font-size: 22px;
    color: var(--md-sys-color-outline);
  }
  .gate-checked .gate-icon {
    color: var(--md-sys-color-primary);
  }
  .gate-reason {
    margin: 6px 0 0 28px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
  }

  /* ── Readiness Summary ── */
  .readiness-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }
  .readiness-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .readiness-row.ready {
    color: var(--md-sys-color-on-surface);
  }
  .readiness-icon {
    font-size: 20px;
    color: var(--md-sys-color-error);
  }
  .readiness-row.ready .readiness-icon {
    color: var(--md-sys-color-primary);
  }
  .readiness-verdict {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding: 10px 12px;
    border-radius: var(--md-sys-shape-corner-small);
    font: var(--md-sys-typescale-label-large-font);
    background: color-mix(in srgb, var(--md-sys-color-error) 8%, transparent);
    color: var(--md-sys-color-error);
  }
  .readiness-verdict.all-ready {
    background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
    color: var(--md-sys-color-primary);
  }
  .readiness-verdict .material-symbols-outlined {
    font-size: 20px;
  }
</style>
