<script>
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { submitArticleFeedback } from '$lib/core/api.js';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';

  const authStore = getAuthStore();

  let { articleId = '', currentFeedback = null } = $props();

  let submitted = $state(false);
  let selected = $state(null);
  let error = $state('');
  let offlineQueued = $state(false);

  $effect(() => {
    if (!submitted) {
      selected = currentFeedback;
    }
  });

  const TYPE_MAP = { agree: 'like', disagree: 'dislike' };

  async function handleFeedback(type) {
    if (submitted) return;

    if (!authStore.isAuthenticated) {
      error = '請先登入才能回饋';
      return;
    }

    selected = type;
    submitted = true;
    error = '';

    if (!navigator.onLine) {
      try {
        const { enqueuePendingSync } = await import('$lib/core/offline-queue.js');
        await enqueuePendingSync('feedback', {
          articleId,
          feedbackType: TYPE_MAP[type],
          token: authStore.token
        });
        offlineQueued = true;
      } catch (e) {
        submitted = false;
        selected = null;
        error = '離線儲存失敗';
      }
      return;
    }

    const result = await submitArticleFeedback(articleId, TYPE_MAP[type], authStore.token);
    if (!result.success) {
      submitted = false;
      selected = null;
      error = '提交失敗，請稍後再試';
    }
  }
</script>

<div class="feedback-buttons">
  {#if error}
    <span class="error-text">{error}</span>
  {:else if submitted}
    <span class="submitted-text">{offlineQueued ? '已儲存，上線後同步' : '已提交'}</span>
  {/if}
  <IconButton
    icon={selected === 'agree' ? 'thumb_up' : 'thumb_up'}
    variant={selected === 'agree' ? 'tonal' : 'standard'}
    label="同意"
    disabled={submitted && selected !== 'agree'}
    onclick={() => handleFeedback('agree')}
  />
  <IconButton
    icon={selected === 'disagree' ? 'thumb_down' : 'thumb_down'}
    variant={selected === 'disagree' ? 'tonal' : 'standard'}
    label="不同意"
    disabled={submitted && selected !== 'disagree'}
    onclick={() => handleFeedback('disagree')}
  />
</div>

<style>
  .feedback-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .submitted-text {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-right: 4px;
  }
  .error-text {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-error);
    margin-right: 4px;
  }
</style>
