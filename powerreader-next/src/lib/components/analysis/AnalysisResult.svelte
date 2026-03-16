<script>
  import Card from '$lib/components/ui/Card.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import ControversyMeter from '$lib/components/data-viz/ControversyMeter.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';

  let { result = {}, onsubmit, ondiscard } = $props();
</script>

<div class="analysis-result">
  {#if result.summary}
    <Card variant="filled">
      <div class="section">
        <h4 class="section-title">摘要</h4>
        <p class="summary-text">{result.summary}</p>
      </div>
    </Card>
  {/if}

  <div class="viz-row">
    {#if result.bias_score != null}
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

  {#if result.camp_ratio}
    <div class="camp-section">
      <span class="viz-label">陣營比例</span>
      <CampBar
        green={result.camp_ratio?.green ?? 0}
        white={result.camp_ratio?.white ?? 0}
        blue={result.camp_ratio?.blue ?? 0}
      />
    </div>
  {/if}

  {#if result.key_phrases?.length}
    <div class="phrases-section">
      <span class="viz-label">關鍵詞</span>
      <div class="phrase-list">
        {#each result.key_phrases as phrase}
          <Chip label={phrase} />
        {/each}
      </div>
    </div>
  {/if}

  {#if result.key_points?.length}
    <div class="points-section">
      <span class="viz-label">重點</span>
      <ul class="point-list">
        {#each result.key_points as point}
          <li>{point}</li>
        {/each}
      </ul>
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
  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .summary-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
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
  .camp-section, .phrases-section, .points-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .phrase-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .point-list {
    margin: 0;
    padding-left: 20px;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.6;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 8px;
  }
</style>
