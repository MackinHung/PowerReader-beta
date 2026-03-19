<script>
  import Card from '$lib/components/ui/Card.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import ControversyMeter from '$lib/components/data-viz/ControversyMeter.svelte';
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
    {#if result.controversy_score != null}
      <div class="viz-item">
        <span class="viz-label">爭議程度</span>
        <ControversyMeter level={result.controversy_score} />
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
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 8px;
  }
</style>
