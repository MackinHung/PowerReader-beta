<script>
  import { t } from '$lib/i18n/zh-TW.js';
  import { isIssueType } from '$lib/utils/knowledge-constants.js';

  let { oldEntry, newEntry } = $props();

  const STANCE_KEYS = ['DPP', 'KMT', 'TPP'];

  let isIssueEntry = $derived(
    isIssueType(oldEntry?.type) || isIssueType(newEntry?.type)
  );

  let fields = $derived(getComparedFields());

  function getComparedFields() {
    const result = [];
    const keys = new Set([
      ...Object.keys(oldEntry || {}),
      ...Object.keys(newEntry || {})
    ]);

    // Skip internal/non-display fields
    const skipFields = new Set([
      'id', 'score', 'batch_file', '_batch',
      'stances', 'source_type', 'report_count', 'keywords'
    ]);

    for (const key of keys) {
      if (skipFields.has(key)) continue;
      const oldVal = oldEntry?.[key] ?? '';
      const newVal = newEntry?.[key] ?? '';
      result.push({
        key,
        oldVal: String(oldVal),
        newVal: String(newVal),
        changed: String(oldVal) !== String(newVal)
      });
    }
    return result;
  }

  // Keywords diff (for incident type)
  let keywordsDiff = $derived(getKeywordsDiff());
  function getKeywordsDiff() {
    const oldKw = Array.isArray(oldEntry?.keywords) ? oldEntry.keywords.join(', ') : '';
    const newKw = Array.isArray(newEntry?.keywords) ? newEntry.keywords.join(', ') : '';
    if (!oldKw && !newKw) return null;
    return { oldVal: oldKw, newVal: newKw, changed: oldKw !== newKw };
  }

  let stancesDiff = $derived(getStancesDiff());

  function getStancesDiff() {
    if (!isIssueEntry) return [];
    const oldStances = oldEntry?.stances || {};
    const newStances = newEntry?.stances || {};
    return STANCE_KEYS.map(key => ({
      key,
      oldVal: oldStances[key] || '',
      newVal: newStances[key] || '',
      changed: (oldStances[key] || '') !== (newStances[key] || '')
    }));
  }
</script>

<div class="diff-view">
  <div class="diff-grid">
    <div class="diff-column">
      <h3 class="diff-heading diff-heading--old">{t('knowledge.diff.before')}</h3>
    </div>
    <div class="diff-column">
      <h3 class="diff-heading diff-heading--new">{t('knowledge.diff.after')}</h3>
    </div>
  </div>

  {#each fields as field (field.key)}
    <div class="diff-field">
      <div class="diff-field-label">
        <span>{field.key}</span>
        {#if field.changed}
          <span class="diff-badge diff-badge--changed">{t('knowledge.diff.changed')}</span>
        {:else}
          <span class="diff-badge diff-badge--unchanged">{t('knowledge.diff.unchanged')}</span>
        {/if}
      </div>
      <div class="diff-grid">
        <div class="diff-cell" class:diff-cell--removed={field.changed}>
          <span class="diff-text">{field.oldVal}</span>
        </div>
        <div class="diff-cell" class:diff-cell--added={field.changed}>
          <span class="diff-text">{field.newVal}</span>
        </div>
      </div>
    </div>
  {/each}

  {#if isIssueEntry}
    <h4 class="diff-stances-heading">{t('knowledge.stances.title')}</h4>
    {#each stancesDiff as stance (stance.key)}
      <div class="diff-field">
        <div class="diff-field-label">
          <span>{stance.key}</span>
          {#if stance.changed}
            <span class="diff-badge diff-badge--changed">{t('knowledge.diff.changed')}</span>
          {:else}
            <span class="diff-badge diff-badge--unchanged">{t('knowledge.diff.unchanged')}</span>
          {/if}
        </div>
        <div class="diff-grid">
          <div class="diff-cell" class:diff-cell--removed={stance.changed}>
            <span class="diff-text">{stance.oldVal || '-'}</span>
          </div>
          <div class="diff-cell" class:diff-cell--added={stance.changed}>
            <span class="diff-text">{stance.newVal || '-'}</span>
          </div>
        </div>
      </div>
    {/each}
  {/if}

  {#if keywordsDiff}
    <div class="diff-field">
      <div class="diff-field-label">
        <span>keywords</span>
        {#if keywordsDiff.changed}
          <span class="diff-badge diff-badge--changed">{t('knowledge.diff.changed')}</span>
        {:else}
          <span class="diff-badge diff-badge--unchanged">{t('knowledge.diff.unchanged')}</span>
        {/if}
      </div>
      <div class="diff-grid">
        <div class="diff-cell" class:diff-cell--removed={keywordsDiff.changed}>
          <span class="diff-text">{keywordsDiff.oldVal || '-'}</span>
        </div>
        <div class="diff-cell" class:diff-cell--added={keywordsDiff.changed}>
          <span class="diff-text">{keywordsDiff.newVal || '-'}</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .diff-view {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .diff-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  @media (max-width: 600px) {
    .diff-grid {
      grid-template-columns: 1fr;
    }
  }

  .diff-heading {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    font: var(--md-sys-typescale-label-large-font);
    text-align: center;
  }

  .diff-heading--old {
    background: var(--md-sys-color-error-container, #fce4ec);
    color: var(--md-sys-color-on-error-container, #b71c1c);
  }

  .diff-heading--new {
    background: #e8f5e9;
    color: #1b5e20;
  }

  .diff-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .diff-field-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    text-transform: capitalize;
  }

  .diff-badge {
    font: var(--md-sys-typescale-label-small-font);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .diff-badge--changed {
    background: #fff3e0;
    color: #e65100;
  }

  .diff-badge--unchanged {
    background: var(--md-sys-color-surface-container, #f5f5f5);
    color: var(--md-sys-color-on-surface-variant);
  }

  .diff-cell {
    padding: 8px 12px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
    border: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    min-height: 32px;
  }

  .diff-cell--removed {
    background: #ffebee;
    border-color: #ef9a9a;
  }

  .diff-cell--added {
    background: #e8f5e9;
    border-color: #a5d6a7;
  }

  .diff-text {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .diff-stances-heading {
    margin: 12px 0 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
</style>
