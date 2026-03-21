<script>
  import { untrack } from 'svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { fetchKnowledgePRs, fetchKnowledgePRDetail, mergeKnowledgePR, closeKnowledgePR } from '$lib/core/api.js';
  import { DiffView } from '$lib/components/knowledge/index.js';
  import { t } from '$lib/i18n/zh-TW.js';

  const auth = getAuthStore();

  let prs = $state([]);
  let loading = $state(true);
  let hasPermission = $state(true);
  let expandedPR = $state(null);  // PR number or null
  let prDetail = $state(null);    // detail data for expanded PR
  let detailLoading = $state(false);
  let actionLoading = $state(null);  // 'merge' | 'close' | null
  let actionResult = $state(null);   // { type, prNumber, message }
  let rejectReason = $state('');
  let showRejectInput = $state(false);

  // Load PRs on mount
  $effect(() => {
    untrack(() => loadPRs());
  });

  async function loadPRs() {
    if (!auth.isAuthenticated || !auth.token) {
      hasPermission = false;
      loading = false;
      return;
    }

    loading = true;
    const result = await fetchKnowledgePRs(auth.token);
    loading = false;

    if (result.success) {
      prs = result.data.prs;
      hasPermission = true;
    } else {
      if (result.error?.status === 403) {
        hasPermission = false;
      }
      prs = [];
    }
  }

  async function toggleExpand(prNumber) {
    if (expandedPR === prNumber) {
      expandedPR = null;
      prDetail = null;
      showRejectInput = false;
      rejectReason = '';
      return;
    }

    expandedPR = prNumber;
    prDetail = null;
    detailLoading = true;
    showRejectInput = false;
    rejectReason = '';

    const result = await fetchKnowledgePRDetail(auth.token, prNumber);
    detailLoading = false;

    if (result.success) {
      prDetail = result.data;
    }
  }

  async function handleMerge(prNumber) {
    actionLoading = 'merge';
    actionResult = null;

    const result = await mergeKnowledgePR(auth.token, prNumber);
    actionLoading = null;

    if (result.success) {
      actionResult = { type: 'merged', prNumber, message: t('knowledge.review.merged') };
      prs = prs.filter(pr => pr.number !== prNumber);
      expandedPR = null;
      prDetail = null;
    } else {
      actionResult = { type: 'error', prNumber, message: t('error.message.generic') };
    }
  }

  async function handleClose(prNumber) {
    actionLoading = 'close';
    actionResult = null;

    const result = await closeKnowledgePR(auth.token, prNumber, rejectReason);
    actionLoading = null;

    if (result.success) {
      actionResult = { type: 'closed', prNumber, message: t('knowledge.review.closed') };
      prs = prs.filter(pr => pr.number !== prNumber);
      expandedPR = null;
      prDetail = null;
      showRejectInput = false;
      rejectReason = '';
    } else {
      actionResult = { type: 'error', prNumber, message: t('error.message.generic') };
    }
  }

  function formatDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleDateString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }
</script>

<div class="review-page">
  <a href="/knowledge" class="back-link">
    <span class="material-symbols-outlined">arrow_back</span>
    {t('knowledge.back_to_list')}
  </a>

  <h1 class="page-title">{t('knowledge.review.title')}</h1>

  {#if loading}
    <div class="loading-state">
      <span class="material-symbols-outlined spinning">progress_activity</span>
      <p>{t('knowledge.review.loading')}</p>
    </div>
  {:else if !hasPermission}
    <div class="no-permission">
      <span class="material-symbols-outlined">block</span>
      <p>{t('knowledge.review.no_permission')}</p>
    </div>
  {:else}
    {#if actionResult}
      <div class="action-result" class:action-result--success={actionResult.type !== 'error'} class:action-result--error={actionResult.type === 'error'}>
        <span class="material-symbols-outlined">
          {actionResult.type === 'error' ? 'error' : 'check_circle'}
        </span>
        {actionResult.message}
      </div>
    {/if}

    {#if prs.length === 0}
      <div class="empty-state">
        <span class="material-symbols-outlined">inbox</span>
        <p>{t('knowledge.review.empty')}</p>
      </div>
    {:else}
    <div class="pr-list">
      {#each prs as pr (pr.number)}
        <div class="pr-item">
          <button class="pr-header" onclick={() => toggleExpand(pr.number)}>
            <div class="pr-info">
              <span class="pr-title">#{pr.number} {pr.title}</span>
              <div class="pr-meta">
                <span>{t('knowledge.review.submitter')}: {pr.user}</span>
                <span>{t('knowledge.review.date')}: {formatDate(pr.created_at)}</span>
              </div>
            </div>
            <span class="material-symbols-outlined expand-icon" class:expanded={expandedPR === pr.number}>
              expand_more
            </span>
          </button>

          {#if expandedPR === pr.number}
            <div class="pr-detail">
              {#if detailLoading}
                <div class="detail-loading">
                  <span class="material-symbols-outlined spinning">progress_activity</span>
                  {t('knowledge.review.loading')}
                </div>
              {:else if prDetail}
                <DiffView
                  oldEntry={parseDiffEntries(prDetail.diff, 'old')}
                  newEntry={parseDiffEntries(prDetail.diff, 'new')}
                />

                <!-- Review Checklist -->
                <div class="review-checklist">
                  <h4 class="checklist-title">{t('knowledge.review.checklist_title')}</h4>
                  <label class="checklist-item"><input type="checkbox" /> {t('knowledge.review.check_objective')}</label>
                  <label class="checklist-item"><input type="checkbox" /> {t('knowledge.review.check_verifiable')}</label>
                  <label class="checklist-item"><input type="checkbox" /> {t('knowledge.review.check_char_limit')}</label>
                  <label class="checklist-item"><input type="checkbox" /> {t('knowledge.review.check_no_slur')}</label>
                  <label class="checklist-item"><input type="checkbox" /> {t('knowledge.review.check_format')}</label>
                </div>

                <div class="pr-actions">
                  <button
                    class="action-btn action-btn--approve"
                    onclick={() => handleMerge(pr.number)}
                    disabled={actionLoading !== null}
                  >
                    {#if actionLoading === 'merge'}
                      <span class="material-symbols-outlined spinning">progress_activity</span>
                      {t('knowledge.review.merging')}
                    {:else}
                      <span class="material-symbols-outlined">check</span>
                      {t('knowledge.review.approve')}
                    {/if}
                  </button>

                  {#if showRejectInput}
                    <div class="reject-input-group">
                      <input
                        type="text"
                        bind:value={rejectReason}
                        placeholder={t('knowledge.review.reject_reason')}
                        class="reject-input"
                      />
                      <button
                        class="action-btn action-btn--reject"
                        onclick={() => handleClose(pr.number)}
                        disabled={actionLoading !== null}
                      >
                        {#if actionLoading === 'close'}
                          <span class="material-symbols-outlined spinning">progress_activity</span>
                          {t('knowledge.review.closing')}
                        {:else}
                          {t('knowledge.review.reject')}
                        {/if}
                      </button>
                    </div>
                  {:else}
                    <button
                      class="action-btn action-btn--reject-toggle"
                      onclick={() => { showRejectInput = true; }}
                      disabled={actionLoading !== null}
                    >
                      <span class="material-symbols-outlined">close</span>
                      {t('knowledge.review.reject')}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {/if}
  {/if}
</div>

<script module>
  /**
   * Parse raw diff lines into before/after entry-like objects for DiffView.
   */
  function parseDiffEntries(diff, side) {
    if (!diff) return {};
    const lines = side === 'old' ? diff.removed : diff.added;
    if (!lines || lines.length === 0) return {};

    // Try to parse JSON-like content from diff lines
    const combined = lines.join('\n');
    try {
      return JSON.parse('{' + combined + '}');
    } catch {
      // Fall back to a simple content representation
      return { content: combined };
    }
  }
</script>

<style>
  .review-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: var(--pr-page-padding, 16px);
    max-width: 900px;
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

  .loading-state, .no-permission, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }
  .loading-state .material-symbols-outlined,
  .no-permission .material-symbols-outlined,
  .empty-state .material-symbols-outlined {
    font-size: 48px;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .action-result {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-body-medium-font);
  }
  .action-result--success {
    background: #e8f5e9;
    color: #1b5e20;
  }
  .action-result--error {
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
  }

  .pr-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pr-item {
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    overflow: hidden;
    background: var(--md-sys-color-surface-container-low);
  }

  .pr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--md-sys-color-on-surface);
  }
  .pr-header:hover {
    background: var(--md-sys-color-surface-container);
  }

  .pr-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .pr-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pr-meta {
    display: flex;
    gap: 16px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    flex-wrap: wrap;
  }

  .expand-icon {
    transition: transform 0.2s;
    font-size: 24px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  .pr-detail {
    padding: 16px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .detail-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    padding: 24px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .pr-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    border: none;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn--approve {
    background: #1b5e20;
    color: #fff;
  }
  .action-btn--approve:hover:not(:disabled) { background: #2e7d32; }

  .action-btn--reject-toggle {
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
  }

  .action-btn--reject {
    background: var(--md-sys-color-error);
    color: var(--md-sys-color-on-error);
  }

  .reject-input-group {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .reject-input {
    padding: 8px 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-body-medium-font);
    min-width: 200px;
  }
  .reject-input:focus {
    outline: 2px solid var(--md-sys-color-primary);
    border-color: transparent;
  }

  .review-checklist {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 16px;
    background: var(--md-sys-color-secondary-container, #e8f0fe);
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }
  .checklist-title {
    margin: 0 0 4px;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-secondary-container);
  }
  .checklist-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-secondary-container);
    cursor: pointer;
  }
  .checklist-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--md-sys-color-primary);
  }
</style>
