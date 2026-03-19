<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { getKnowledgeStore } from '$lib/stores/knowledge.svelte.js';
  import { proposeKnowledgeEdit } from '$lib/core/api.js';
  import { t } from '$lib/i18n/zh-TW.js';

  const auth = getAuthStore();
  const knowledge = getKnowledgeStore();

  let entryId = $derived(page.url.searchParams.get('id') || '');
  let entry = $derived(knowledge.getEntry(entryId));
  let isTopic = $derived(entry?.type === 'topic');

  // Form state
  let editTitle = $state('');
  let editContent = $state('');
  let editStanceDPP = $state('');
  let editStanceKMT = $state('');
  let editStanceTPP = $state('');
  let editReason = $state('');
  let submitting = $state(false);
  let submitResult = $state(null); // { success, pr_url, pr_number } | { error, errorType }
  let formInitialized = $state(false);

  // Load knowledge and init form when entry is available
  $effect(() => {
    untrack(() => knowledge.loadKnowledge());
  });

  $effect(() => {
    if (entry && !formInitialized) {
      editTitle = entry.title || '';
      editContent = entry.content || '';
      if (entry.stances) {
        editStanceDPP = entry.stances.DPP || '';
        editStanceKMT = entry.stances.KMT || '';
        editStanceTPP = entry.stances.TPP || '';
      }
      formInitialized = true;
    }
  });

  let canSubmit = $derived(
    editReason.trim().length > 0 && !submitting && hasChanges()
  );

  function hasChanges() {
    if (!entry) return false;
    if (editTitle !== (entry.title || '')) return true;
    if (!isTopic && editContent !== (entry.content || '')) return true;
    if (isTopic && entry.stances) {
      if (editStanceDPP !== (entry.stances.DPP || '')) return true;
      if (editStanceKMT !== (entry.stances.KMT || '')) return true;
      if (editStanceTPP !== (entry.stances.TPP || '')) return true;
    }
    return false;
  }

  async function handleSubmit() {
    if (!canSubmit || !auth.token || !entry) return;

    submitting = true;
    submitResult = null;

    const changes = {};
    if (editTitle !== (entry.title || '')) {
      changes.title = editTitle;
    }
    if (isTopic) {
      const newStances = {};
      if (editStanceDPP !== (entry.stances?.DPP || '')) newStances.DPP = editStanceDPP;
      if (editStanceKMT !== (entry.stances?.KMT || '')) newStances.KMT = editStanceKMT;
      if (editStanceTPP !== (entry.stances?.TPP || '')) newStances.TPP = editStanceTPP;
      if (Object.keys(newStances).length > 0) {
        changes.content = JSON.stringify({
          ...entry.stances,
          ...newStances
        });
      }
    } else {
      if (editContent !== (entry.content || '')) {
        changes.content = editContent;
      }
    }

    const result = await proposeKnowledgeEdit(auth.token, {
      entry_id: entry.id,
      batch_file: entry.batch_file || 'batch_001',
      changes,
      reason: editReason,
      content_hash: entry.content_hash || ''
    });

    submitting = false;

    if (result.success) {
      submitResult = {
        success: true,
        pr_url: result.data.pr_url,
        pr_number: result.data.pr_number
      };
    } else {
      const errorType = result.error?.type || 'unknown';
      submitResult = { error: true, errorType };
    }
  }
</script>

<div class="edit-page">
  <a href="/knowledge/{entryId}" class="back-link">
    <span class="material-symbols-outlined">arrow_back</span>
    {t('knowledge.back_to_list')}
  </a>

  <h1 class="page-title">{t('knowledge.edit.title')}</h1>

  {#if !auth.isAuthenticated}
    <div class="login-prompt">
      <span class="material-symbols-outlined">lock</span>
      <p>{t('knowledge.edit.login_required')}</p>
    </div>
  {:else if knowledge.loading}
    <div class="loading-state">
      <span class="material-symbols-outlined spinning">progress_activity</span>
      <p>{t('common.label.loading')}</p>
    </div>
  {:else if !entry}
    <div class="not-found">
      <span class="material-symbols-outlined">search_off</span>
      <p>{t('knowledge.not_found')}</p>
    </div>
  {:else if submitResult?.success}
    <div class="success-state">
      <span class="material-symbols-outlined">check_circle</span>
      <h2>{t('knowledge.edit.success')}</h2>
      <p>{t('knowledge.edit.success_detail')}</p>
      {#if submitResult.pr_url}
        <a href={submitResult.pr_url} target="_blank" rel="noopener" class="pr-link">
          {t('knowledge.edit.view_pr')} #{submitResult.pr_number}
        </a>
      {/if}
      <a href="/knowledge/{entryId}" class="back-btn">{t('knowledge.back_to_list')}</a>
    </div>
  {:else}
    <form class="edit-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="form-field">
        <label for="edit-title">{t('knowledge.admin.form.title')}</label>
        <input id="edit-title" type="text" bind:value={editTitle} />
      </div>

      {#if isTopic}
        <div class="form-field">
          <label for="edit-stance-dpp">{t('knowledge.stances.dpp')}</label>
          <textarea id="edit-stance-dpp" bind:value={editStanceDPP} rows="3"></textarea>
        </div>
        <div class="form-field">
          <label for="edit-stance-kmt">{t('knowledge.stances.kmt')}</label>
          <textarea id="edit-stance-kmt" bind:value={editStanceKMT} rows="3"></textarea>
        </div>
        <div class="form-field">
          <label for="edit-stance-tpp">{t('knowledge.stances.tpp')}</label>
          <textarea id="edit-stance-tpp" bind:value={editStanceTPP} rows="3"></textarea>
        </div>
      {:else}
        <div class="form-field">
          <label for="edit-content">{t('knowledge.admin.form.content')}</label>
          <textarea id="edit-content" bind:value={editContent} rows="6"></textarea>
        </div>
      {/if}

      <div class="form-field">
        <label for="edit-reason">{t('knowledge.edit.reason')}</label>
        <input
          id="edit-reason"
          type="text"
          bind:value={editReason}
          placeholder={t('knowledge.edit.reason_placeholder')}
          required
        />
      </div>

      {#if submitResult?.error}
        <div class="error-message">
          <span class="material-symbols-outlined">error</span>
          {#if submitResult.errorType === 'content_changed'}
            {t('knowledge.edit.conflict')}
          {:else if submitResult.errorType === 'pr_exists'}
            {t('knowledge.edit.pr_exists')}
          {:else}
            {t('error.message.generic')}
          {/if}
        </div>
      {/if}

      <button type="submit" class="submit-btn" disabled={!canSubmit}>
        {#if submitting}
          <span class="material-symbols-outlined spinning">progress_activity</span>
          {t('knowledge.edit.submitting')}
        {:else}
          {t('knowledge.edit.submit')}
        {/if}
      </button>
    </form>
  {/if}
</div>

<style>
  .edit-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 720px;
    margin: 0 auto;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--md-sys-color-primary);
    text-decoration: none;
    font: var(--md-sys-typescale-label-large-font);
    padding: 4px 0;
  }
  .back-link:hover { text-decoration: underline; }

  .page-title {
    margin: 0;
    font: var(--pr-heading-font, var(--md-sys-typescale-headline-small-font));
    color: var(--md-sys-color-on-surface);
  }

  .login-prompt, .loading-state, .not-found, .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }
  .login-prompt .material-symbols-outlined,
  .loading-state .material-symbols-outlined,
  .not-found .material-symbols-outlined,
  .success-state .material-symbols-outlined {
    font-size: 48px;
  }

  .success-state .material-symbols-outlined {
    color: #1b5e20;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .pr-link {
    padding: 8px 16px;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    text-decoration: none;
    font: var(--md-sys-typescale-label-large-font);
  }
  .pr-link:hover { opacity: 0.9; }

  .back-btn {
    padding: 8px 16px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    color: var(--md-sys-color-primary);
    text-decoration: none;
    font: var(--md-sys-typescale-label-large-font);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-field label {
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  .form-field input,
  .form-field textarea {
    padding: 10px 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    background: var(--md-sys-color-surface);
    resize: vertical;
  }
  .form-field input:focus,
  .form-field textarea:focus {
    outline: 2px solid var(--md-sys-color-primary);
    border-color: transparent;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-body-medium-font);
  }

  .submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border: none;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .submit-btn:hover:not(:disabled) { opacity: 0.9; }
  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
