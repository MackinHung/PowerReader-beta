<script>
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import ProgressIndicator from '$lib/components/ui/ProgressIndicator.svelte';

  let {
    status = 'idle',
    currentArticle = '',
    progress = { done: 0, total: 0 },
    stats = { analyzed: 0, success_rate: 0 },
    onpause,
    onresume,
    onstop,
  } = $props();

  let progressPct = $derived(
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null
  );
</script>

{#if status !== 'idle'}
  <div class="auto-runner-bar">
    <div class="bar-left">
      {#if status === 'running'}
        <IconButton icon="pause" label="暫停" onclick={onpause} />
      {:else}
        <IconButton icon="play_arrow" label="繼續" onclick={onresume} />
      {/if}
      <IconButton icon="stop" label="停止" onclick={onstop} />
    </div>

    <div class="bar-center">
      <span class="current-article" title={currentArticle}>
        {currentArticle || '等待中...'}
      </span>
      <div class="progress-row">
        <ProgressIndicator type="linear" value={progressPct} />
        <span class="progress-text">{progress.done}/{progress.total} 已分析</span>
      </div>
    </div>

    <div class="bar-right">
      <span class="stat">成功率 {Math.round(stats.success_rate * 100)}%</span>
    </div>
  </div>
{/if}

<style>
  .auto-runner-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 8px;
    background: var(--md-sys-color-surface-container);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
  }
  .bar-left {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .bar-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .current-article {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .progress-text {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .bar-right {
    flex-shrink: 0;
  }
  .stat {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
