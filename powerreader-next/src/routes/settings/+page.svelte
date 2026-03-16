<script>
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import List from '$lib/components/ui/List.svelte';
  import ListItem from '$lib/components/ui/ListItem.svelte';
  import { runPreDownloadChecks, downloadModel, deleteModel, isModelDownloaded, getDownloadProgress } from '$lib/core/manager.js';
  import { scanGPU, getCachedBenchmark } from '$lib/core/benchmark.js';

  let autoMode = $state(false);
  let autoSubmit = $state(false);
  let notifications = $state(true);
  let cacheEnabled = $state(true);

  let modelStatus = $state('未下載');
  let modelDownloading = $state(false);
  let gpuInfo = $state('偵測中...');
  let cacheSize = $state('計算中...');

  $effect(() => {
    if (typeof window === 'undefined') return;

    // Load saved settings
    autoMode = localStorage.getItem('analysis_mode') === 'auto';
    autoSubmit = localStorage.getItem('auto_submit') === 'true';
    notifications = localStorage.getItem('notifications') !== 'false';
    cacheEnabled = localStorage.getItem('cache_enabled') !== 'false';

    // Check initial model status
    isModelDownloaded().then(downloaded => {
      if (downloaded) modelStatus = '已下載';
    }).catch(() => {});

    // Check cached benchmark for GPU info
    const cached = getCachedBenchmark();
    if (cached && cached.gpu_info) {
      const gi = cached.gpu_info;
      if (gi.supported && (gi.device || gi.vramMB)) {
        gpuInfo = gi.device
          ? `${gi.device} (${gi.vramMB} MB)`
          : `WebGPU 可用 (${gi.vramMB} MB)`;
      } else if (!gi.supported) {
        gpuInfo = 'WebGPU 不可用';
      }
    }

    // If no cached info, do a live GPU scan
    if (!cached || !cached.gpu_info) {
      scanGPU().then(result => {
        if (result.supported) {
          gpuInfo = result.device
            ? `${result.device} (${result.vramMB} MB)`
            : 'WebGPU 可用';
        } else {
          gpuInfo = 'WebGPU 不可用';
        }
      }).catch(() => {
        gpuInfo = 'WebGPU 不可用';
      });
    }

    // Estimate cache
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(est => {
        const usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
        cacheSize = `${usedMB} MB`;
      });
    } else {
      cacheSize = '無法計算';
    }
  });

  let initialized = $state(false);

  // Persist settings to localStorage when they change (after initial load)
  $effect(() => {
    if (!initialized || typeof window === 'undefined') return;
    localStorage.setItem('analysis_mode', autoMode ? 'auto' : 'manual');
    localStorage.setItem('auto_submit', String(autoSubmit));
    localStorage.setItem('notifications', String(notifications));
    localStorage.setItem('cache_enabled', String(cacheEnabled));
  });

  // Mark initialized after first load completes
  $effect(() => {
    if (typeof window !== 'undefined') {
      // Use microtask to avoid triggering save on initial load
      queueMicrotask(() => { initialized = true; });
    }
  });

  async function handleDownloadModel() {
    modelDownloading = true;
    try {
      modelStatus = '檢查下載條件...';
      const { canDownload, checks } = await runPreDownloadChecks();
      if (!canDownload) {
        const failedCheck = checks.find(c => !c.ok);
        modelStatus = failedCheck?.reason || '下載條件不符';
        modelDownloading = false;
        return;
      }

      modelStatus = '下載中... 0%';
      await downloadModel('', (downloaded, total) => {
        const pct = Math.round((downloaded / total) * 100);
        modelStatus = `下載中... ${pct}%`;
      });
      modelStatus = '已下載';
    } catch (err) {
      modelStatus = `下載失敗：${err.message || '未知錯誤'}`;
    } finally {
      modelDownloading = false;
    }
  }

  async function handleDeleteModel() {
    try {
      await deleteModel();
      modelStatus = '未下載';
    } catch (err) {
      modelStatus = `刪除失敗：${err.message || '未知錯誤'}`;
    }
  }

  async function handleClearCache() {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    cacheSize = '0 MB';
  }

  async function handleBenchmark() {
    gpuInfo = '偵測中...';
    try {
      const result = await scanGPU();
      if (result.supported) {
        gpuInfo = result.device
          ? `${result.device} (${result.vramMB} MB)`
          : `WebGPU 可用 (${result.vramMB} MB)`;
      } else {
        gpuInfo = 'WebGPU 不可用';
      }
    } catch {
      gpuInfo = 'WebGPU 偵測失敗';
    }
  }
</script>

<div class="settings-page">
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

  <section class="section">
    <h3 class="section-title">模型管理</h3>
    <Card variant="filled">
      <div class="model-section">
        <div class="model-info">
          <span class="material-symbols-outlined">smart_toy</span>
          <div class="model-text">
            <span class="model-name">Qwen3-8B</span>
            <span class="model-status">{modelStatus}</span>
          </div>
        </div>
        <div class="model-actions">
          {#if modelStatus === '未下載'}
            <Button onclick={handleDownloadModel} disabled={modelDownloading}>
              下載模型
            </Button>
          {:else if modelStatus === '已下載'}
            <Button variant="outlined" onclick={handleDeleteModel}>
              刪除模型
            </Button>
          {/if}
        </div>
      </div>
    </Card>
  </section>

  <section class="section">
    <h3 class="section-title">硬體資訊</h3>
    <Card variant="filled">
      <List>
        <ListItem headline="GPU" supporting={gpuInfo}>
          {#snippet trailing()}
            <Button variant="text" onclick={handleBenchmark}>測試</Button>
          {/snippet}
        </ListItem>
      </List>
    </Card>
  </section>

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
  .model-info .material-symbols-outlined {
    font-size: 32px;
    color: var(--md-sys-color-primary);
  }
  .model-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .model-name {
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
  }
  .model-status {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .model-actions {
    display: flex;
    gap: 8px;
  }
</style>
