<script>
  import Card from '$lib/components/ui/Card.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';
  import EmotionMeter from '$lib/components/data-viz/EmotionMeter.svelte';
  import { t } from '$lib/i18n/zh-TW.js';

  let { result = {}, onsubmit, ondiscard } = $props();

  let isPolitical = $derived(result.is_political !== false);
</script>

<div class="analysis-result">
  {#if !isPolitical}
    <div class="not-political-badge">
      <span class="material-symbols-outlined">info</span>
      <span>{t('analysis.not_political')}</span>
    </div>
  {/if}

  <div class="viz-row">
    {#if isPolitical && result.bias_score != null}
      <div class="viz-item">
        <span class="viz-label">立場偏向</span>
        <BiasSpectrum score={result.bias_score} />
      </div>
    {/if}
  </div>

  {#if isPolitical && result.camp_ratio}
    <div class="camp-section">
      <span class="viz-label">陣營比例</span>
      <CampBar
        green={result.camp_ratio?.green ?? 0}
        white={result.camp_ratio?.white ?? 0}
        blue={result.camp_ratio?.blue ?? 0}
      />
    </div>
  {/if}

  {#if result.emotion_intensity != null}
    <div class="emotion-section">
      <EmotionMeter intensity={result.emotion_intensity} />
    </div>
  {/if}

  {#if result.points?.length > 0}
    <div class="points-section">
      <span class="section-label">論述重點</span>
      {#each result.points as point}
        <p class="point-item">{point}</p>
      {/each}
    </div>
  {/if}

  {#if result.stances && Object.keys(result.stances).length > 0}
    <div class="stances-section">
      <span class="section-label">各方立場</span>
      {#each Object.entries(result.stances) as [party, stance]}
        <div class="stance-item">
          <span class="stance-party">{party}</span>
          <span class="stance-desc">{stance}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if result.source_attribution}
    <div class="source-attribution">
      <span class="material-symbols-outlined">article</span>
      <span>{result.source_attribution}</span>
    </div>
  {/if}

  <div class="actions">
    <Button onclick={onsubmit}>提交分析</Button>
    <Button variant="text" onclick={ondiscard}>放棄</Button>
  </div>
</div>

<style>
  .analysis-result {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .not-political-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    font: var(--md-sys-typescale-label-medium-font);
  }
  .not-political-badge .material-symbols-outlined {
    font-size: 18px;
  }
  .viz-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .viz-item {
    flex: 1;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .viz-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .camp-section, .emotion-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .points-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .section-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .point-item {
    margin: 0;
    padding-left: 12px;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.5;
    position: relative;
  }
  .point-item::before {
    content: '•';
    position: absolute;
    left: 0;
  }
  .source-attribution {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface-container);
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .source-attribution .material-symbols-outlined {
    font-size: 16px;
  }
  .stances-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stance-item {
    display: flex;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .stance-item:last-child {
    border-bottom: none;
  }
  .stance-party {
    font: var(--md-sys-typescale-label-medium-font);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
    min-width: 60px;
    flex-shrink: 0;
  }
  .stance-desc {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 8px;
  }
</style>
