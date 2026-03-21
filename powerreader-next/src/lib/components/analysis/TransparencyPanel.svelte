<script>
  import Card from '$lib/components/ui/Card.svelte';
  import { t } from '$lib/i18n/zh-TW.js';

  let { details = {}, fingerprint = null } = $props();

  let expandedSection = $state('');

  const SECTIONS = [
    { key: 'l1_prompt', label: 'L1 靜態提示詞', icon: 'description' },
    { key: 'l2_knowledge', label: 'L2 RAG 知識注入', icon: 'auto_stories' },
    { key: 'l3_input', label: 'L3 文章輸入', icon: 'article' },
  ];

  function toggle(key) {
    expandedSection = expandedSection === key ? '' : key;
  }

  function formatTimestamp(iso) {
    try {
      return new Date(iso).toLocaleString('zh-TW');
    } catch {
      return iso;
    }
  }
</script>

<Card variant="filled">
  <div class="transparency-panel">
    <div class="panel-header">
      <span class="material-symbols-outlined header-icon">visibility</span>
      <span class="header-title">分析透明度</span>
    </div>

    <div class="meta-row">
      {#if details.tokens_used != null}
        <span class="meta-chip">
          <span class="material-symbols-outlined meta-icon">token</span>
          {details.tokens_used} tokens
        </span>
      {/if}
      {#if details.inference_time_ms != null}
        <span class="meta-chip">
          <span class="material-symbols-outlined meta-icon">timer</span>
          {(details.inference_time_ms / 1000).toFixed(1)}s
        </span>
      {/if}
    </div>

    <div class="sections">
      {#each SECTIONS as section}
        {#if details[section.key]}
          <div class="section" class:expanded={expandedSection === section.key}>
            <button class="section-header" onclick={() => toggle(section.key)}>
              <span class="material-symbols-outlined section-icon">{section.icon}</span>
              <span class="section-label">{section.label}</span>
              <span class="material-symbols-outlined expand-icon" class:rotated={expandedSection === section.key}>
                expand_more
              </span>
            </button>
            {#if expandedSection === section.key}
              <div class="section-content">
                <pre>{details[section.key]}</pre>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    {#if fingerprint}
      <div class="fingerprint-section">
        <div class="fingerprint-header">
          <span class="material-symbols-outlined fingerprint-icon">verified</span>
          <span class="fingerprint-title">{t('analyze.transparency.fingerprint_title')}</span>
        </div>
        <div class="fingerprint-grid">
          <span class="fp-label">{t('analyze.transparency.fp_model')}</span>
          <span class="fp-value">{fingerprint.model_id}</span>

          <span class="fp-label">{t('analyze.transparency.fp_prompt_hash')}</span>
          <span class="fp-value fp-mono">{fingerprint.prompt_hash.slice(0, 16)}...</span>

          <span class="fp-label">{t('analyze.transparency.fp_pass1')}</span>
          <span class="fp-value">{fingerprint.pass1_tokens} tokens / {(fingerprint.pass1_time_ms / 1000).toFixed(1)}s</span>

          <span class="fp-label">{t('analyze.transparency.fp_pass2')}</span>
          <span class="fp-value">{fingerprint.pass2_tokens} tokens / {(fingerprint.pass2_time_ms / 1000).toFixed(1)}s</span>

          <span class="fp-label">{t('analyze.transparency.fp_throughput')}</span>
          <span class="fp-value">{fingerprint.tokens_per_second} tok/s</span>

          <span class="fp-label">{t('analyze.transparency.fp_gpu')}</span>
          <span class="fp-value">{fingerprint.gpu_tier} · {fingerprint.gpu_device || '—'}</span>

          <span class="fp-label">{t('analyze.transparency.fp_timestamp')}</span>
          <span class="fp-value">{formatTimestamp(fingerprint.timestamp)}</span>
        </div>
      </div>
    {/if}
  </div>
</Card>

<style>
  .transparency-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-icon {
    font-size: 20px;
    color: var(--md-sys-color-primary);
  }
  .header-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .meta-row {
    display: flex;
    gap: 12px;
  }
  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container);
    padding: 4px 10px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .meta-icon {
    font-size: 16px;
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .section {
    border-radius: var(--md-sys-shape-corner-small);
    overflow: hidden;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px;
    border: none;
    background: var(--md-sys-color-surface-container);
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .section-header:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .section-icon {
    font-size: 18px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .section-label {
    flex: 1;
    text-align: left;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .expand-icon {
    font-size: 20px;
    color: var(--md-sys-color-on-surface-variant);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .expand-icon.rotated {
    transform: rotate(180deg);
  }
  .section-content {
    padding: 8px 12px 12px;
    background: var(--md-sys-color-surface-container);
    overflow-x: auto;
  }
  .section-content pre {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }
  .fingerprint-section {
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding-top: 10px;
  }
  .fingerprint-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .fingerprint-icon {
    font-size: 18px;
    color: var(--camp-green, #4CAF50);
  }
  .fingerprint-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .fingerprint-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    font: var(--md-sys-typescale-body-small-font);
  }
  .fp-label {
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
  }
  .fp-value {
    color: var(--md-sys-color-on-surface);
    word-break: break-all;
  }
  .fp-mono {
    font-family: monospace;
  }
</style>
