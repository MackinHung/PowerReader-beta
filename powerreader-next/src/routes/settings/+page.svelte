<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import List from '$lib/components/ui/List.svelte';
  import ListItem from '$lib/components/ui/ListItem.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { getWebLLMEngine, clearAllModelCaches, hasWebGPU, detectBestMode, INFERENCE_MODES } from '$lib/core/inference.js';
  import { scanGPU, getCachedBenchmark, runBenchmark, clearBenchmark, saveUserGPUSelection, getUserGPUSelection, getTimeoutForTier } from '$lib/core/benchmark.js';
  import { isModelDownloaded } from '$lib/core/manager.js';

  const authStore = getAuthStore();

  // ── Analysis settings ──
  let autoMode = $state(false);
  let autoSubmit = $state(false);
  let notifications = $state(true);
  let cacheEnabled = $state(true);

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

  // ── Benchmark state ──
  let benchResult = $state(null);       // { mode, latency_ms, gpu_info, tested_at }
  let benchRunning = $state(false);
  let benchStage = $state('');

  // ── GPU manual selection ──
  let showGpuPicker = $state(false);
  let selectedGpu = $state('');
  let userOverride = $state(null);      // getUserGPUSelection()

  // ── Inference mode ──
  let inferenceMode = $state('');

  // ── Cache ──
  let cacheSize = $state('計算中...');

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

    // Model status — check actual WebLLM caches in Cache API
    modelReady = await checkWebLLMCacheExists();

    // GPU: load cached benchmark
    benchResult = getCachedBenchmark();
    userOverride = getUserGPUSelection();

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

    // Fetch daily quota if authenticated
    if (authStore.isAuthenticated) {
      await authStore.fetchPoints().catch(() => {});
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
    // Clear stale benchmark so old "不建議本地推理" doesn't persist
    if (benchResult && benchResult.mode === 'none') {
      benchResult = null;
    }
  }

  // ── Benchmark ──
  async function handleRunBenchmark() {
    // Guard: model must be downloaded first
    if (!modelReady) {
      benchStage = '尚未下載模型，請先下載';
      return;
    }
    benchRunning = true;
    benchStage = '掃描 GPU...';
    try {
      const result = await runBenchmark(
        () => getWebLLMEngine(),
        (progress) => {
          const stages = {
            scanning_gpu: '掃描 GPU...',
            loading_engine: '載入模型...',
            running_inference: '推理測試中...',
            done: '完成',
            error: '測試失敗'
          };
          benchStage = stages[progress.stage] || progress.stage;
        }
      );
      benchResult = result;
      // Update GPU result from benchmark
      if (result.gpu_info) {
        gpuResult = result.gpu_info;
        webgpuSupported = result.gpu_info.supported;
      }
    } catch {
      benchStage = '測試失敗';
    } finally {
      benchRunning = false;
    }
  }

  // ── Cache ──
  async function handleClearCache() {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    cacheSize = '0 MB';
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

  function getTierLabel(mode) {
    const labels = { gpu: 'GPU 加速', cpu: 'CPU 模式', none: '不建議本地推理' };
    return labels[mode] || '未測試';
  }

  function getTierColor(mode) {
    const colors = { gpu: 'var(--md-sys-color-primary)', cpu: 'var(--md-sys-color-tertiary)', none: 'var(--md-sys-color-error)' };
    return colors[mode] || 'var(--md-sys-color-on-surface-variant)';
  }

  function getModeLabel(mode) {
    return mode === INFERENCE_MODES.WEBGPU ? 'WebGPU 本地推理' : '伺服器推理';
  }
</script>

<div class="settings-page">
  <!-- ═══ Analysis Settings ═══ -->
  <section class="section">
    <h3 class="section-title">分析設定</h3>
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
    </Card>
  </section>

  <!-- ═══ Daily Quota ═══ -->
  {#if authStore.isAuthenticated}
    <section class="section">
      <h3 class="section-title">每日分析配額</h3>
      <Card variant="filled">
        <div class="quota-section">
          <div class="quota-header">
            <span class="quota-text">
              {authStore.dailyQuota.used} / {authStore.dailyQuota.limit} 次
            </span>
            <span class="quota-hint">每次分析可獲得 0.1~0.5 點</span>
          </div>
          <div class="quota-bar-track">
            <div
              class="quota-bar-fill"
              style:width="{Math.min(100, (authStore.dailyQuota.used / authStore.dailyQuota.limit) * 100)}%"
              class:quota-bar-full={authStore.dailyQuota.remaining === 0}
            ></div>
          </div>
          <span class="quota-reset-hint">每日 00:00 (台灣時間) 重置</span>
        </div>
      </Card>
    </section>
  {/if}

  <!-- ═══ Model Management ═══ -->
  <section class="section">
    <h3 class="section-title">模型管理</h3>
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
      </div>
    </Card>
  </section>

  <!-- ═══ Hardware Detection ═══ -->
  <section class="section">
    <h3 class="section-title">硬體偵測</h3>
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

        <!-- VRAM Verdict -->
        {#if !gpuScanning}
          <div class="verdict-row" style:color={vramVerdict.color}>
            <span class="material-symbols-outlined verdict-icon">{vramVerdict.icon}</span>
            <span>{vramVerdict.text}</span>
          </div>
        {/if}

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

        <!-- Benchmark Section -->
        <div class="bench-section">
          {#if benchResult && !benchRunning}
            <div class="bench-result">
              <div class="bench-tier" style:color={getTierColor(benchResult.mode)}>
                <span class="material-symbols-outlined">
                  {benchResult.mode === 'gpu' ? 'bolt' : benchResult.mode === 'cpu' ? 'memory' : 'block'}
                </span>
                <span class="bench-tier-text">{getTierLabel(benchResult.mode)}</span>
              </div>
              <div class="bench-details">
                <span>延遲：{(benchResult.latency_ms / 1000).toFixed(1)} 秒</span>
                <span>逾時設定：{(getTimeoutForTier(benchResult.mode) / 1000).toFixed(0)} 秒/Pass</span>
              </div>
            </div>
          {/if}

          {#if benchRunning}
            <div class="bench-running">
              <ProgressIndicator type="circular" />
              <span>{benchStage}</span>
            </div>
          {:else if benchStage && !benchResult}
            <div class="bench-hint">
              <span class="material-symbols-outlined">info</span>
              <span>{benchStage}</span>
            </div>
          {/if}

          <Button variant="outlined" onclick={handleRunBenchmark} disabled={benchRunning}>
            <span class="material-symbols-outlined">speed</span>
            {benchResult ? '重新測試' : '效能測試'}
          </Button>
        </div>
      </div>
    </Card>
  </section>

  <!-- ═══ Cache Management ═══ -->
  <section class="section">
    <h3 class="section-title">快取管理</h3>
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

  <!-- ═══ About ═══ -->
  <section class="section">
    <h3 class="section-title">關於</h3>
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

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    padding-left: 4px;
  }

  /* ── Quota Section ── */
  .quota-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }
  .quota-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .quota-text {
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 500;
  }
  .quota-hint {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .quota-bar-track {
    height: 8px;
    border-radius: 4px;
    background: var(--md-sys-color-surface-container-highest);
    overflow: hidden;
  }
  .quota-bar-fill {
    height: 100%;
    border-radius: 4px;
    background: var(--md-sys-color-primary);
    transition: width 0.3s ease;
  }
  .quota-bar-full {
    background: var(--md-sys-color-error);
  }
  .quota-reset-hint {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

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
    padding-left: 44px;
  }
  .model-actions {
    display: flex;
    gap: 8px;
    padding-left: 44px;
  }
  .model-error {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 44px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-error);
  }
  .model-error .material-symbols-outlined {
    font-size: 18px;
  }

  /* ── Download Progress ── */
  .download-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 44px 0 44px;
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
    max-width: 320px;
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

  /* ── Benchmark ── */
  .bench-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
  .bench-result {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bench-tier {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bench-tier .material-symbols-outlined {
    font-size: 24px;
  }
  .bench-tier-text {
    font: var(--md-sys-typescale-title-small-font);
    font-weight: 500;
  }
  .bench-details {
    display: flex;
    gap: 16px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .bench-running {
    display: flex;
    align-items: center;
    gap: 12px;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .bench-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-tertiary);
  }
  .bench-hint .material-symbols-outlined {
    font-size: 18px;
  }
</style>
