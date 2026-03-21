<script>
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { t } from '$lib/i18n/zh-TW.js';
  import { createSponsorOrder, fetchSponsorStats } from '$lib/core/api.js';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';

  const auth = getAuthStore();

  // Sponsor flow state
  let selectedAmount = $state(0);
  let customAmount = $state('');
  let selectedType = $state('');
  let paying = $state(false);
  let errorMsg = $state('');

  const PRESET_AMOUNTS = [60, 150, 300];

  const SPONSOR_TYPES = [
    { key: 'coffee',  icon: 'coffee',    nameKey: 'sponsor.type_coffee',  descKey: 'sponsor.type_coffee_desc' },
    { key: 'civic',   icon: 'groups',    nameKey: 'sponsor.type_civic',   descKey: 'sponsor.type_civic_desc' },
    { key: 'compute', icon: 'memory',    nameKey: 'sponsor.type_compute', descKey: 'sponsor.type_compute_desc' },
    { key: 'proxy',   icon: 'newspaper', nameKey: 'sponsor.type_proxy',   descKey: 'sponsor.type_proxy_desc' },
  ];

  let finalAmount = $derived(selectedAmount > 0 ? selectedAmount : (Number(customAmount) || 0));
  let canPay = $derived(finalAmount >= 30 && selectedType !== '');

  // Stats
  let stats = $state(null);
  let statsLoading = $state(true);

  onMount(() => {
    fetchSponsorStats().then(res => {
      if (res.success) stats = res.data;
      statsLoading = false;
    });
  });

  function selectAmount(amount) {
    selectedAmount = amount;
    customAmount = '';
  }

  function onCustomInput(e) {
    selectedAmount = 0;
    customAmount = e.target.value;
  }

  function selectType(key) {
    selectedType = key;
  }

  async function handlePay() {
    if (!canPay || paying) return;
    paying = true;
    errorMsg = '';

    const token = auth.token || undefined;
    const res = await createSponsorOrder({ amount: finalAmount, type: selectedType }, token);

    if (!res.success) {
      errorMsg = t('sponsor.error');
      paying = false;
      return;
    }

    // Create hidden form and submit to ECPay
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = res.data.action_url;
    for (const [key, value] of Object.entries(res.data.form_params)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  let poolTotal = $derived(
    stats ? stats.pools.developer + stats.pools.platform + stats.pools.compute : 0
  );

  function poolPercent(value, total) {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  }
</script>

<div class="power-pool-page">
  <header class="page-header">
    <h1 class="page-title">{t('power_pool.title')}</h1>
    <p class="page-subtitle">{t('power_pool.subtitle')}</p>
  </header>

  <!-- Section 1: Flywheel Vision -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">cycle</span>
      {t('power_pool.flywheel.title')}
    </h2>
    <Card variant="elevated">
      <div class="flywheel-container">
        <div class="flywheel-ring">
          <div class="flywheel-step" style="--i: 0">
            <span class="material-symbols-outlined step-icon">memory</span>
            <span class="step-label">{t('power_pool.flywheel.step1')}</span>
          </div>
          <div class="flywheel-step" style="--i: 1">
            <span class="material-symbols-outlined step-icon">toll</span>
            <span class="step-label">{t('power_pool.flywheel.step2')}</span>
          </div>
          <div class="flywheel-step" style="--i: 2">
            <span class="material-symbols-outlined step-icon">share</span>
            <span class="step-label">{t('power_pool.flywheel.step3')}</span>
          </div>
          <div class="flywheel-step" style="--i: 3">
            <span class="material-symbols-outlined step-icon">campaign</span>
            <span class="step-label">{t('power_pool.flywheel.step4')}</span>
          </div>
          <div class="flywheel-step" style="--i: 4">
            <span class="material-symbols-outlined step-icon">group_add</span>
            <span class="step-label">{t('power_pool.flywheel.step5')}</span>
          </div>
          <svg class="flywheel-svg" viewBox="0 0 300 300" aria-hidden="true">
            <circle cx="150" cy="150" r="110" class="flywheel-circle" />
            <path d="M 260 150 L 252 143 M 260 150 L 252 157" class="flywheel-arrow" />
          </svg>
        </div>
        <p class="flywheel-desc">{t('power_pool.flywheel.step1')}</p>
      </div>
    </Card>
  </section>

  <!-- Section 2: Sponsor & Subscribe (2-step flow) -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">favorite</span>
      {t('sponsor.title')}
    </h2>
    <Card variant="elevated">
      <div class="sponsor-flow">
        <p class="sponsor-desc">{t('power_pool.sponsor.desc')}</p>

        <!-- Step 1: Amount Selection -->
        <div class="sponsor-step">
          <h3 class="step-heading">{t('sponsor.step1_title')}</h3>
          <div class="amount-grid">
            {#each PRESET_AMOUNTS as amt}
              <button
                class="amount-btn"
                class:selected={selectedAmount === amt}
                onclick={() => selectAmount(amt)}
              >
                ${amt}
              </button>
            {/each}
            <div class="amount-custom-wrap">
              <input
                type="number"
                class="amount-custom"
                class:selected={selectedAmount === 0 && customAmount !== ''}
                placeholder={t('sponsor.amount_custom')}
                min="30"
                value={customAmount}
                oninput={onCustomInput}
              />
              <span class="amount-min-hint">{t('sponsor.amount_min')}</span>
            </div>
          </div>
        </div>

        <!-- Step 2: Type Selection (shown when amount selected) -->
        {#if finalAmount >= 30}
          <div class="sponsor-step">
            <h3 class="step-heading">{t('sponsor.step2_title')}</h3>
            <div class="type-grid">
              {#each SPONSOR_TYPES as st}
                <button
                  class="type-card"
                  class:selected={selectedType === st.key}
                  onclick={() => selectType(st.key)}
                >
                  <span class="material-symbols-outlined type-icon">{st.icon}</span>
                  <span class="type-name">{t(st.nameKey)}</span>
                  <span class="type-desc">{t(st.descKey)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Pay Button -->
        {#if canPay}
          <button
            class="pay-btn"
            onclick={handlePay}
            disabled={paying}
          >
            <span class="material-symbols-outlined">payment</span>
            {paying ? t('sponsor.paying') : `${t('sponsor.pay_button')} $${finalAmount}`}
          </button>
        {/if}

        {#if errorMsg}
          <p class="sponsor-error">{errorMsg}</p>
        {/if}
      </div>
    </Card>
  </section>

  <!-- Section 3: Sponsor Transparency Stats -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">verified</span>
      {t('sponsor.stats_title')}
    </h2>
    <Card variant="elevated">
      <div class="stats-card">
        {#if statsLoading}
          <p class="stats-loading">{t('common.label.loading')}</p>
        {:else if stats && stats.total_count > 0}
          <div class="stats-summary">
            <div class="stats-kpi">
              <span class="kpi-value">${stats.total_amount.toLocaleString()}</span>
              <span class="kpi-label">{t('sponsor.total_amount')}</span>
            </div>
            <div class="stats-kpi">
              <span class="kpi-value">{stats.total_count}</span>
              <span class="kpi-label">{t('sponsor.total_count')}</span>
            </div>
          </div>
          <div class="pool-bars">
            <div class="pool-row">
              <span class="pool-label">{t('sponsor.pool_developer')}</span>
              <div class="pool-bar-track">
                <div class="pool-bar-fill developer" style="width: {poolPercent(stats.pools.developer, poolTotal)}%"></div>
              </div>
              <span class="pool-value">${stats.pools.developer.toLocaleString()}</span>
            </div>
            <div class="pool-row">
              <span class="pool-label">{t('sponsor.pool_platform')}</span>
              <div class="pool-bar-track">
                <div class="pool-bar-fill platform" style="width: {poolPercent(stats.pools.platform, poolTotal)}%"></div>
              </div>
              <span class="pool-value">${stats.pools.platform.toLocaleString()}</span>
            </div>
            <div class="pool-row">
              <span class="pool-label">{t('sponsor.pool_compute')}</span>
              <div class="pool-bar-track">
                <div class="pool-bar-fill compute" style="width: {poolPercent(stats.pools.compute, poolTotal)}%"></div>
              </div>
              <span class="pool-value">${stats.pools.compute.toLocaleString()}</span>
            </div>
          </div>
        {:else}
          <p class="stats-empty">{t('sponsor.no_stats')}</p>
        {/if}
      </div>
    </Card>
  </section>

  <!-- Section 4: Transparency Plan -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">verified</span>
      {t('power_pool.transparency.title')}
    </h2>
    <Card variant="elevated">
      <div class="transparency-card">
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">how_to_vote</span>
          <div class="item-content">
            <h3>{t('power_pool.transparency.distribution').split('：')[0]}</h3>
            <p>{t('power_pool.transparency.governance')}</p>
          </div>
        </div>
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">visibility</span>
          <div class="item-content">
            <h3>{t('power_pool.transparency.commitment').split('，')[0]}</h3>
            <p>{t('power_pool.transparency.commitment')}</p>
          </div>
        </div>
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">groups</span>
          <div class="item-content">
            <h3>{t('power_pool.transparency.distribution').split('：')[0]}</h3>
            <p>{t('power_pool.transparency.distribution')}</p>
          </div>
        </div>
      </div>
    </Card>
  </section>

  <!-- Section 5: Group Analysis Report Example -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">assessment</span>
      {t('power_pool.report.title')}
    </h2>
    <p class="section-desc">{t('power_pool.report.desc')}</p>
    <Card variant="elevated">
      <div class="report-mock">
        <div class="report-badge">{t('power_pool.report.mock_label')}</div>
        <h3 class="report-topic">{t('power_pool.report.stance_distribution')}</h3>

        <div class="report-section">
          <h4>{t('power_pool.report.stance_distribution')}</h4>
          <div class="stance-bars">
            <div class="stance-row">
              <span class="stance-label">{t('blindspot.camp.pan_green')}</span>
              <div class="stance-bar-track">
                <div class="stance-bar-fill green" style="width: 42%"></div>
              </div>
              <span class="stance-pct">42%</span>
            </div>
            <div class="stance-row">
              <span class="stance-label">{t('blindspot.camp.pan_white')}</span>
              <div class="stance-bar-track">
                <div class="stance-bar-fill white" style="width: 23%"></div>
              </div>
              <span class="stance-pct">23%</span>
            </div>
            <div class="stance-row">
              <span class="stance-label">{t('blindspot.camp.pan_blue')}</span>
              <div class="stance-bar-track">
                <div class="stance-bar-fill blue" style="width: 35%"></div>
              </div>
              <span class="stance-pct">35%</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  </section>
</div>

<style>
  .power-pool-page {
    display: flex;
    flex-direction: column;
    gap: var(--pr-page-gap);
    padding: var(--pr-page-padding);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }
  .page-header {
    padding: 4px 0 12px;
  }
  .page-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
    padding-left: 16px;
    border-left: 5px solid #FF5722;
    letter-spacing: 0.01em;
  }
  .page-subtitle {
    margin: 6px 0 0;
    padding-left: 21px;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
    border-left: 4px solid #FF5722;
  }
  .section-icon {
    font-size: 24px;
    color: #FF5722;
    flex-shrink: 0;
  }
  .section-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Flywheel */
  .flywheel-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    gap: 16px;
  }
  .flywheel-ring {
    position: relative;
    width: min(260px, 75vw);
    height: min(260px, 75vw);
  }
  @media (min-width: 768px) {
    .flywheel-ring {
      width: 300px;
      height: 300px;
    }
  }
  .flywheel-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .flywheel-circle {
    fill: none;
    stroke: var(--md-sys-color-primary);
    stroke-width: 2;
    stroke-dasharray: 12 6;
    opacity: 0.3;
    animation: flywheel-spin 20s linear infinite;
    transform-origin: center;
  }
  .flywheel-arrow {
    fill: none;
    stroke: var(--md-sys-color-primary);
    stroke-width: 2.5;
    opacity: 0.5;
  }
  @keyframes flywheel-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .flywheel-step {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 80px;
    text-align: center;
    transform: translate(-50%, -50%);
  }
  .flywheel-step:nth-child(1) { top: 5%;  left: 50%; }
  .flywheel-step:nth-child(2) { top: 33%; left: 95%; }
  .flywheel-step:nth-child(3) { top: 82%; left: 80%; }
  .flywheel-step:nth-child(4) { top: 82%; left: 20%; }
  .flywheel-step:nth-child(5) { top: 33%; left: 5%; }
  .step-icon {
    font-size: 28px;
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-surface);
    border-radius: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--md-sys-color-primary);
  }
  .step-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .flywheel-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }

  /* Sponsor Flow */
  .sponsor-flow {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
  }
  .sponsor-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
  }
  .sponsor-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .step-heading {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }

  /* Amount Grid */
  .amount-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  @media (min-width: 480px) {
    .amount-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .amount-btn {
    padding: 12px 8px;
    border: 2px solid var(--md-sys-color-outline);
    border-radius: 0;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .amount-btn:hover {
    border-color: var(--md-sys-color-primary);
  }
  .amount-btn.selected {
    border-color: #FF5722;
    background: rgba(255, 87, 34, 0.08);
    color: #FF5722;
    font-weight: 700;
  }
  .amount-custom-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .amount-custom {
    padding: 12px 8px;
    border: 2px solid var(--md-sys-color-outline);
    border-radius: 0;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-label-large-font);
    width: 100%;
    box-sizing: border-box;
  }
  .amount-custom.selected {
    border-color: #FF5722;
  }
  .amount-custom:focus {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: -2px;
  }
  .amount-min-hint {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Type Grid */
  .type-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .type-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 8px;
    border: 2px solid var(--md-sys-color-outline);
    border-radius: 0;
    background: var(--md-sys-color-surface);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }
  .type-card:hover {
    border-color: var(--md-sys-color-primary);
  }
  .type-card.selected {
    border-color: #FF5722;
    background: rgba(255, 87, 34, 0.08);
  }
  .type-icon {
    font-size: 28px;
    color: var(--md-sys-color-primary);
  }
  .type-card.selected .type-icon {
    color: #FF5722;
  }
  .type-name {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .type-desc {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.3;
  }

  /* Pay Button */
  .pay-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 28px;
    border: 3px solid var(--pr-ink);
    border-radius: 0;
    background: #FF5722;
    color: white;
    font: var(--md-sys-typescale-label-large-font);
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
    align-self: center;
  }
  .pay-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
  .pay-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .sponsor-error {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-error);
    text-align: center;
  }

  /* Stats */
  .stats-card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .stats-loading, .stats-empty {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
    padding: 16px;
  }
  .stats-summary {
    display: flex;
    justify-content: center;
    gap: 32px;
  }
  .stats-kpi {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .kpi-value {
    font: var(--md-sys-typescale-headline-small-font);
    color: #FF5722;
    font-weight: 700;
  }
  .kpi-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .pool-bars {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pool-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pool-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    width: 64px;
    flex-shrink: 0;
  }
  .pool-bar-track {
    flex: 1;
    height: 14px;
    background: var(--md-sys-color-surface-container);
    border: 2px solid var(--pr-ink);
    overflow: hidden;
  }
  .pool-bar-fill {
    height: 100%;
    transition: width 0.6s ease;
  }
  .pool-bar-fill.developer { background: #FF5722; }
  .pool-bar-fill.platform { background: #2196f3; }
  .pool-bar-fill.compute { background: #4caf50; }
  .pool-value {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    width: 72px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Transparency */
  .transparency-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  .transparency-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .item-icon {
    font-size: 24px;
    color: var(--md-sys-color-primary);
    flex-shrink: 0;
    margin-top: 2px;
  }
  .item-content h3 {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .item-content p {
    margin: 4px 0 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Report Mock */
  .report-mock {
    position: relative;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .report-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font: var(--md-sys-typescale-label-small-font);
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
    padding: 2px 10px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
  }
  .report-topic {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .report-section h4 {
    margin: 0 0 8px;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .stance-bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stance-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .stance-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    width: 40px;
    flex-shrink: 0;
  }
  .stance-bar-track {
    flex: 1;
    height: 12px;
    background: var(--md-sys-color-surface-container);
    border-radius: 0;
    border: 2px solid var(--pr-ink);
    overflow: hidden;
  }
  .stance-bar-fill {
    height: 100%;
    border-radius: 0;
    transition: width 0.6s ease;
  }
  .stance-bar-fill.green { background: #4caf50; }
  .stance-bar-fill.white { background: #9e9e9e; }
  .stance-bar-fill.blue { background: #2196f3; }
  .stance-pct {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
