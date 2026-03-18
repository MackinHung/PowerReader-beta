<script>
  /**
   * StancePrism — issue stance horizontal bars (DPP/TPP/KMT).
   * Shows WHAT the articles say: gradient bars per party.
   * Collapsible, shows "needs AI analysis" when no data.
   *
   * @prop avgCampRatio {{ dpp?: number, tpp?: number, kmt?: number } | null}
   * @prop analyzedCount {number} — how many articles were analyzed
   * @prop totalCount {number} — total articles in cluster
   */
  let { avgCampRatio = null, analyzedCount = 0, totalCount = 0 } = $props();

  let expanded = $state(false);

  const PARTIES = [
    { key: 'dpp', label: '民進黨', gradient: 'linear-gradient(to right, var(--stance-dpp-deep), var(--stance-dpp-light))' },
    { key: 'tpp', label: '民眾黨', gradient: 'linear-gradient(to right, var(--stance-tpp-deep), var(--stance-tpp-light))' },
    { key: 'kmt', label: '國民黨', gradient: 'linear-gradient(to right, var(--stance-kmt-deep), var(--stance-kmt-light))' },
  ];

  let hasData = $derived(avgCampRatio && analyzedCount > 0);

  let bars = $derived(() => {
    if (!avgCampRatio) return [];
    return PARTIES
      .map(p => ({ ...p, value: avgCampRatio[p.key] ?? 0 }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);
  });

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class="stance-prism">
  <button class="toggle-btn" onclick={toggle} aria-expanded={expanded}>
    <span class="toggle-label">
      {#if hasData}
        <span class="material-symbols-outlined toggle-icon">psychology</span>
        議題立場分析
      {:else}
        <span class="material-symbols-outlined toggle-icon" style="color: var(--md-sys-color-outline)">smart_toy</span>
        <span class="no-data-label">議題立場需 AI 分析</span>
      {/if}
    </span>
    {#if hasData}
      <span class="material-symbols-outlined chevron" class:open={expanded}>
        expand_more
      </span>
    {/if}
  </button>

  {#if expanded && hasData}
    <div class="prism-body">
      {#each bars() as bar (bar.key)}
        <div class="bar-row">
          <span class="party-label">{bar.label}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width: {bar.value}%; background-image: {bar.gradient}"></div>
          </div>
          <span class="bar-value">{Math.round(bar.value)}%</span>
        </div>
      {/each}
      <span class="coverage-note">
        基於 {analyzedCount}/{totalCount} 篇已分析
      </span>
    </div>
  {/if}
</div>

<style>
  .stance-prism {
    width: 100%;
  }
  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-label-medium-font);
  }
  .toggle-btn:hover {
    color: var(--md-sys-color-primary);
  }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toggle-icon {
    font-size: 18px;
  }
  .no-data-label {
    color: var(--md-sys-color-outline);
  }
  .chevron {
    font-size: 20px;
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .chevron.open {
    transform: rotate(180deg);
  }
  .prism-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0 4px;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .party-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    min-width: 42px;
    text-align: right;
  }
  .bar-track {
    flex: 1;
    height: 12px;
    background: var(--md-sys-color-surface-container-high);
    border-radius: var(--md-sys-shape-corner-full);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: var(--md-sys-shape-corner-full);
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
    min-width: 4px;
  }
  .bar-value {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    min-width: 32px;
    text-align: right;
  }
  .coverage-note {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-outline);
    text-align: right;
    margin-top: 2px;
  }
</style>
