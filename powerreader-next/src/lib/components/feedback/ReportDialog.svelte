<script>
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { reportArticle } from '$lib/core/api.js';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';

  const authStore = getAuthStore();

  let { open = $bindable(false), articleId = '' } = $props();

  let reason = $state('');
  let details = $state('');
  let submitting = $state(false);
  let error = $state('');

  const REASONS = [
    { value: 'inaccurate', label: '分析結果不準確' },
    { value: 'biased', label: '內容有偏見' },
    { value: 'other', label: '其他問題' },
  ];

  async function handleSubmit() {
    if (!reason || submitting) return;
    submitting = true;
    error = '';

    const result = await reportArticle(articleId, reason, details, authStore.token);
    submitting = false;

    if (result.success) {
      reason = '';
      details = '';
      open = false;
    } else {
      error = '提交失敗，請稍後再試';
    }
  }

  function handleCancel() {
    reason = '';
    details = '';
    error = '';
    open = false;
  }
</script>

<Dialog bind:open title="回報分析問題">
  <div class="report-form">
    <div class="radio-group">
      {#each REASONS as opt}
        <label class="radio-item">
          <input
            type="radio"
            name="report-reason"
            value={opt.value}
            bind:group={reason}
          />
          <span class="radio-label">{opt.label}</span>
        </label>
      {/each}
    </div>

    <div class="textarea-wrap">
      <label class="textarea-label" for="report-details">補充說明 (選填)</label>
      <textarea
        id="report-details"
        class="textarea-input"
        bind:value={details}
        rows="3"
        placeholder="請描述您發現的問題..."
      ></textarea>
    </div>

    {#if error}
      <p class="error-text">{error}</p>
    {/if}

    <div class="actions">
      <Button variant="text" onclick={handleCancel}>取消</Button>
      <Button disabled={!reason || submitting} onclick={handleSubmit}>
        {submitting ? '提交中...' : '提交'}
      </Button>
    </div>
  </div>
</Dialog>

<style>
  .report-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .radio-item {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }
  .radio-item input[type="radio"] {
    accent-color: var(--md-sys-color-primary);
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  .radio-label {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .textarea-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .textarea-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .textarea-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: transparent;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    resize: vertical;
    outline: none;
  }
  .textarea-input:focus {
    border-color: var(--md-sys-color-primary);
    border-width: 2px;
  }
  .textarea-input::placeholder {
    color: var(--md-sys-color-on-surface-variant);
  }
  .error-text {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-error);
    margin: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
