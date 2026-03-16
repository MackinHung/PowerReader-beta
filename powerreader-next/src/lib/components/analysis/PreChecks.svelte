<script>
  import Button from '$lib/components/ui/Button.svelte';

  let { checks = { gpu: false, model: false, article: false, queue: false }, onstart } = $props();

  const CHECK_LABELS = {
    gpu: 'WebGPU 支援',
    model: '模型已載入',
    article: '文章已選取',
    queue: '佇列可用',
  };

  let allPassed = $derived(
    checks.gpu && checks.model && checks.article && checks.queue
  );
</script>

<div class="pre-checks">
  <div class="check-list">
    {#each Object.entries(CHECK_LABELS) as [key, label]}
      <div class="check-item">
        <span class="material-symbols-outlined check-icon" class:pass={checks[key]} class:fail={!checks[key]}>
          {checks[key] ? 'check_circle' : 'cancel'}
        </span>
        <span class="check-label">{label}</span>
      </div>
    {/each}
  </div>

  <div class="status-row">
    <span class="status-text" class:ready={allPassed}>
      {allPassed ? '準備就緒' : '尚未就緒'}
    </span>
    <Button disabled={!allPassed} onclick={onstart}>開始分析</Button>
  </div>
</div>

<style>
  .pre-checks {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .check-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .check-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .check-icon {
    font-size: 20px;
  }
  .check-icon.pass {
    color: var(--camp-green, #4CAF50);
  }
  .check-icon.fail {
    color: var(--md-sys-color-error);
  }
  .check-label {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .status-text {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-error);
  }
  .status-text.ready {
    color: var(--camp-green, #4CAF50);
  }
</style>
