<script>
  import { t } from '$lib/i18n/zh-TW.js';

  let { stances } = $props();

  const PARTIES = [
    { key: 'DPP', color: '#1B9431', label: () => t('knowledge.stances.dpp') },
    { key: 'KMT', color: '#0047AB', label: () => t('knowledge.stances.kmt') },
    { key: 'TPP', color: '#28C8C8', label: () => t('knowledge.stances.tpp') }
  ];
</script>

<section class="stances-section" aria-label={t('knowledge.stances.title')}>
  <h2 class="stances-heading">{t('knowledge.stances.title')}</h2>
  <div class="stances-grid">
    {#each PARTIES as party (party.key)}
      {@const stance = stances?.[party.key]}
      <div class="stance-card">
        <div class="stance-header" style="background-color: {party.color}">
          <span class="stance-party-name">{party.label()}</span>
        </div>
        <div class="stance-body">
          {#if stance}
            <p class="stance-text">{stance}</p>
          {:else}
            <p class="stance-missing">{t('knowledge.stances.missing')}</p>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .stances-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stances-heading {
    margin: 0;
    font: var(--pr-heading-font, var(--md-sys-typescale-title-medium-font));
    color: var(--md-sys-color-on-surface);
  }

  .stances-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  @media (max-width: 768px) {
    .stances-grid {
      grid-template-columns: 1fr;
    }
  }

  .stance-card {
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    overflow: hidden;
    background: var(--md-sys-color-surface);
  }

  .stance-header {
    padding: 10px 14px;
    color: #fff;
  }

  .stance-party-name {
    font: var(--md-sys-typescale-label-large-font);
    font-weight: 600;
  }

  .stance-body {
    padding: 14px;
  }

  .stance-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .stance-missing {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    font-style: italic;
  }
</style>
