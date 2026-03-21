<script>
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { getKnowledgeStore } from '$lib/stores/knowledge.svelte.js';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { TopicStanceView } from '$lib/components/knowledge/index.js';
  import { isFigureType, isIssueType, isIncidentType } from '$lib/utils/knowledge-constants.js';
  import { reportKnowledgeEntry } from '$lib/core/api.js';
  import { t } from '$lib/i18n/zh-TW.js';

  const auth = getAuthStore();

  const store = getKnowledgeStore();

  const TYPE_ICONS = {
    politician: 'person',
    figure: 'person',
    topic: 'topic',
    issue: 'topic',
    event: 'event',
    incident: 'event'
  };

  const PARTY_COLORS = {
    KMT: '#0047AB',
    DPP: '#1B9431',
    TPP: '#28C8C8',
    NPP: '#FBBE01',
    TSP: '#C7002E'
  };

  let entryId = $derived(page.params.id);
  let entry = $derived(store.getEntry(entryId));
  let entryIsFigure = $derived(entry ? isFigureType(entry.type) : false);
  let entryIsIssue = $derived(entry ? isIssueType(entry.type) : false);
  let entryIsIncident = $derived(entry ? isIncidentType(entry.type) : false);
  let icon = $derived(entry ? (TYPE_ICONS[entry.type] || 'article') : 'article');
  let typeLabel = $derived(entry ? (t(`knowledge.type.${entry.type}`) || entry.type) : '');
  let partyLabel = $derived(
    !entryIsIssue && entry?.party ? (t(`knowledge.party.${entry.party}`) || entry.party) : null
  );
  let partyColor = $derived(
    !entryIsIssue && entry?.party ? (PARTY_COLORS[entry.party] || '#888') : null
  );
  let sourceLabel = $derived(
    entry?.source_type ? t(`knowledge.source.${entry.source_type}`) : null
  );

  // Report state
  let showReportInput = $state(false);
  let reportReason = $state('');
  let reportLoading = $state(false);
  let reportResult = $state(null); // 'success' | 'error' | null

  async function handleReport() {
    if (!auth.token || !entry || !reportReason.trim()) return;
    reportLoading = true;
    const result = await reportKnowledgeEntry(entry.id, reportReason.trim(), auth.token);
    reportLoading = false;
    reportResult = result.success ? 'success' : 'error';
    if (result.success) {
      showReportInput = false;
      reportReason = '';
    }
  }

  // Ensure knowledge is loaded
  $effect(() => {
    untrack(() => store.loadKnowledge());
  });
</script>

<div class="detail-page">
  <a href="/knowledge" class="back-link">
    <span class="material-symbols-outlined">arrow_back</span>
    {t('knowledge.back_to_list')}
  </a>

  {#if store.loading}
    <div class="loading-state">
      <span class="material-symbols-outlined spinning">progress_activity</span>
      <p>{t('common.label.loading')}</p>
    </div>
  {:else if !entry}
    <div class="not-found">
      <span class="material-symbols-outlined">search_off</span>
      <p>{t('knowledge.not_found')}</p>
      <a href="/knowledge" class="retry-btn">{t('knowledge.back_to_list')}</a>
    </div>
  {:else}
    <article class="entry-detail">
      <div class="entry-header">
        <span class="material-symbols-outlined entry-icon">{icon}</span>
        <span class="type-badge">{typeLabel}</span>
        {#if partyLabel}
          <span class="party-badge" style="background-color: {partyColor}">{partyLabel}</span>
        {/if}
        {#if sourceLabel}
          <span class="source-badge">{sourceLabel}</span>
        {/if}
      </div>

      <h1 class="entry-title">{entry.title}</h1>

      <div class="entry-id">
        <span class="material-symbols-outlined">tag</span>
        {entry.id}
      </div>

      {#if entryIsIssue}
        {#if entry.description}
          <div class="entry-section">
            <h2 class="section-label">{t('knowledge.field.description')}</h2>
            <p class="entry-content">{entry.description}</p>
          </div>
        {/if}
        {#if entry.stances}
          <TopicStanceView stances={entry.stances} description={entry.description} />
        {/if}
      {:else if entryIsFigure}
        {#if entry.period}
          <div class="entry-section">
            <h2 class="section-label">{t('knowledge.field.period')}</h2>
            <p class="entry-content">{entry.period}</p>
          </div>
        {/if}
        {#if entry.background}
          <div class="entry-section">
            <h2 class="section-label">{t('knowledge.field.background')}</h2>
            <p class="entry-content">{entry.background}</p>
          </div>
        {/if}
        {#if entry.content && !entry.period && !entry.background}
          <div class="entry-content">{entry.content}</div>
        {/if}
      {:else if entryIsIncident}
        {#if entry.date}
          <div class="entry-section">
            <h2 class="section-label">{t('knowledge.field.date')}</h2>
            <p class="entry-content">{entry.date}</p>
          </div>
        {/if}
        {#if entry.description}
          <div class="entry-section">
            <h2 class="section-label">{t('knowledge.field.description')}</h2>
            <p class="entry-content">{entry.description}</p>
          </div>
        {/if}
        {#if entry.keywords?.length}
          <div class="entry-section">
            <h2 class="section-label">{t('knowledge.field.keywords')}</h2>
            <div class="keywords-row">
              {#each entry.keywords as kw}
                <span class="keyword-chip">{kw}</span>
              {/each}
            </div>
          </div>
        {/if}
        {#if entry.content && !entry.description}
          <div class="entry-content">{entry.content}</div>
        {/if}
      {:else}
        <div class="entry-content">{entry.content}</div>
      {/if}

      <div class="entry-actions">
        {#if auth.isAuthenticated}
          <a href="/knowledge/edit?id={entry.id}" class="suggest-edit-btn">
            <span class="material-symbols-outlined">edit</span>
            {t('knowledge.edit.suggest')}
          </a>
          <button class="report-btn" onclick={() => { showReportInput = !showReportInput; }}>
            <span class="material-symbols-outlined">flag</span>
            {t('knowledge.report.button')}
            {#if entry.report_count > 0}
              <span class="report-count">{t('knowledge.report.count', { count: entry.report_count })}</span>
            {/if}
          </button>
        {:else}
          <span class="suggest-edit-hint">
            <span class="material-symbols-outlined">lock</span>
            {t('knowledge.edit.login_required')}
          </span>
        {/if}
      </div>

      {#if showReportInput}
        <div class="report-form">
          <input
            type="text"
            bind:value={reportReason}
            placeholder={t('knowledge.report.reason_placeholder')}
            maxlength="200"
            class="report-input"
          />
          <button
            class="report-submit"
            onclick={handleReport}
            disabled={reportLoading || !reportReason.trim()}
          >
            {#if reportLoading}
              <span class="material-symbols-outlined spinning">progress_activity</span>
            {:else}
              {t('common.button.submit')}
            {/if}
          </button>
        </div>
        {#if reportResult === 'success'}
          <p class="report-msg report-msg--success">{t('knowledge.report.success')}</p>
        {:else if reportResult === 'error'}
          <p class="report-msg report-msg--error">{t('knowledge.report.error')}</p>
        {/if}
      {/if}
    </article>
  {/if}
</div>

<style>
  .detail-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: var(--pr-page-padding, 16px);
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
  .back-link:hover {
    text-decoration: underline;
  }

  .entry-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    background: var(--md-sys-color-surface-container-low);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .entry-icon {
    font-size: 24px;
    color: var(--md-sys-color-primary);
  }
  .type-badge {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-primary-container);
    background: var(--md-sys-color-primary-container);
    padding: 4px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }
  .party-badge {
    font: var(--md-sys-typescale-label-medium-font);
    color: #fff;
    padding: 4px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }

  .entry-title {
    margin: 0;
    font: var(--pr-heading-font, var(--md-sys-typescale-headline-small-font));
    color: var(--md-sys-color-on-surface);
    overflow-wrap: break-word;
  }

  .entry-id {
    display: flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .entry-id .material-symbols-outlined {
    font-size: 14px;
  }

  .source-badge {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-tertiary-container);
    background: var(--md-sys-color-tertiary-container);
    padding: 4px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
  }

  .entry-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .section-label {
    margin: 0;
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-primary);
  }

  .entry-content {
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  .keywords-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .keyword-chip {
    font: var(--md-sys-typescale-label-medium-font);
    padding: 4px 12px;
    background: var(--md-sys-color-surface-container);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    color: var(--md-sys-color-on-surface);
  }

  .entry-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    margin-top: 4px;
  }
  @media (min-width: 768px) {
    .entry-actions {
      flex-direction: row;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  }
  .report-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface-variant);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .report-btn:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .report-btn .material-symbols-outlined {
    font-size: 18px;
  }
  .report-count {
    font: var(--md-sys-typescale-label-small-font);
    opacity: 0.7;
  }
  .report-form {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .report-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-body-medium-font);
  }
  .report-input:focus {
    outline: 2px solid var(--md-sys-color-primary);
    border-color: transparent;
  }
  .report-submit {
    padding: 8px 16px;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border: none;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .report-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .report-msg {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    padding: 4px 0;
  }
  .report-msg--success { color: #1b5e20; }
  .report-msg--error { color: var(--md-sys-color-error); }
  .suggest-edit-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    border-radius: var(--md-sys-shape-corner-small, 8px);
    text-decoration: none;
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
  }
  .suggest-edit-btn:hover {
    opacity: 0.9;
  }
  .suggest-edit-btn .material-symbols-outlined {
    font-size: 18px;
  }
  .suggest-edit-hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .suggest-edit-hint .material-symbols-outlined {
    font-size: 16px;
  }

  /* States */
  .loading-state, .not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }
  .loading-state .material-symbols-outlined,
  .not-found .material-symbols-outlined {
    font-size: 48px;
  }
  .spinning {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .retry-btn {
    padding: 8px 16px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    border: 1px solid var(--md-sys-color-outline);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-primary);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    text-decoration: none;
  }
  .retry-btn:hover {
    background: var(--md-sys-color-surface-container);
  }
</style>
