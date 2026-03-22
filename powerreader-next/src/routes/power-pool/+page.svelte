<script>
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { t } from '$lib/i18n/zh-TW.js';
  import { fetchSponsorStats } from '$lib/core/api.js';

  // Stats
  let stats = $state(null);
  let statsLoading = $state(true);

  onMount(() => {
    fetchSponsorStats().then(res => {
      if (res.success) stats = res.data;
      statsLoading = false;
    });
  });

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

  <!-- Section 2: Sponsor & Subscribe (coming soon) -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">favorite</span>
      {t('sponsor.title')}
    </h2>
    <Card variant="elevated">
      <div class="sponsor-coming-soon">
        <span class="material-symbols-outlined coming-soon-icon">construction</span>
        <p class="coming-soon-text">即將開放</p>
        <p class="coming-soon-desc">贊助功能正在準備中，敬請期待</p>
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

  <!-- Section 4: Contribution Mechanisms -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">verified</span>
      {t('power_pool.transparency.title')}
    </h2>
    <p class="section-desc">{t('power_pool.transparency.subtitle')}</p>
    <Card variant="elevated">
      <div class="transparency-card">
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">account_balance</span>
          <div class="item-content">
            <h3>{t('power_pool.transparency.platform_fund_title')}</h3>
            <p>{t('power_pool.transparency.platform_fund_desc')}</p>
          </div>
        </div>
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">memory</span>
          <div class="item-content">
            <h3>{t('power_pool.transparency.proxy_compute_title')}</h3>
            <p>{t('power_pool.transparency.proxy_compute_desc')}</p>
          </div>
        </div>
        <div class="transparency-item highlight">
          <span class="material-symbols-outlined item-icon">casino</span>
          <div class="item-content">
            <h3>
              {t('power_pool.transparency.reward_title')}
              <span class="reward-badge">{t('power_pool.transparency.reward_badge')}</span>
            </h3>
            <p>{t('power_pool.transparency.reward_desc')}</p>
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
      <div class="report-preview">
        <div class="report-badge">{t('power_pool.report.mock_label')}</div>

        <!-- 1. Direction badge -->
        <div class="rp-direction-row">
          <h3 class="rp-topic">{t('power_pool.report.mock_topic')}</h3>
          <span class="rp-direction-badge diverse">
            {t('power_pool.report.mock_direction')}
          </span>
        </div>
        <p class="rp-meta">{t('power_pool.report.mock_meta')}</p>

        <!-- 2. Source breakdown -->
        <div class="rp-source-list">
          <div class="rp-source-row">
            <span class="rp-camp-dot" style="background: #2E7D32"></span>
            <span class="rp-source-name">自由時報</span>
            <span class="rp-camp-tag green">泛綠</span>
            <span class="rp-bias">-1.8</span>
            <span class="rp-angle">強調修法保障勞權，批評資方反對聲浪</span>
          </div>
          <div class="rp-source-row">
            <span class="rp-camp-dot" style="background: #757575"></span>
            <span class="rp-source-name">中央社</span>
            <span class="rp-camp-tag neutral">中立</span>
            <span class="rp-bias">+0.2</span>
            <span class="rp-angle">平衡報導各方立場，引述勞資雙方說法</span>
          </div>
          <div class="rp-source-row">
            <span class="rp-camp-dot" style="background: #1565C0"></span>
            <span class="rp-source-name">聯合報</span>
            <span class="rp-camp-tag blue">泛藍</span>
            <span class="rp-bias">+1.5</span>
            <span class="rp-angle">聚焦企業經營成本增加，引述商會反對意見</span>
          </div>
          <div class="rp-source-row">
            <span class="rp-camp-dot" style="background: #1565C0"></span>
            <span class="rp-source-name">TVBS</span>
            <span class="rp-camp-tag blue">泛藍</span>
            <span class="rp-bias">+2.0</span>
            <span class="rp-angle">側重產業衝擊面，引述企業主訪談</span>
          </div>
          <div class="rp-source-row">
            <span class="rp-camp-dot" style="background: #757575"></span>
            <span class="rp-source-name">公視</span>
            <span class="rp-camp-tag neutral">中立</span>
            <span class="rp-bias">-0.3</span>
            <span class="rp-angle">訪問勞工團體與學者，探討政策長期影響</span>
          </div>
        </div>

        <!-- 3. Camp statistics -->
        <div class="rp-camp-grid">
          <div class="rp-camp-card green">
            <span class="rp-camp-card-label">泛綠</span>
            <span class="rp-camp-card-stat">1 篇 · avg -1.8</span>
            <span class="rp-camp-card-mood">略帶立場</span>
          </div>
          <div class="rp-camp-card neutral">
            <span class="rp-camp-card-label">中立</span>
            <span class="rp-camp-card-stat">2 篇 · avg -0.1</span>
            <span class="rp-camp-card-mood">冷靜客觀</span>
          </div>
          <div class="rp-camp-card blue">
            <span class="rp-camp-card-label">泛藍</span>
            <span class="rp-camp-card-stat">2 篇 · avg +1.8</span>
            <span class="rp-camp-card-mood">情緒化</span>
          </div>
        </div>

        <!-- 4. Group summary -->
        <p class="rp-summary">{t('power_pool.report.mock_summary')}</p>
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

  /* Sponsor Coming Soon */
  .sponsor-coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 20px;
  }
  .coming-soon-icon {
    font-size: 48px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.5;
  }
  .coming-soon-text {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .coming-soon-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
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
  .transparency-item.highlight {
    background: rgba(255, 87, 34, 0.06);
    padding: 12px;
    border-left: 3px solid #FF5722;
  }
  .transparency-item.highlight .item-icon {
    color: #FF5722;
  }

  /* Reward Badge */
  .reward-badge {
    display: inline-block;
    font: var(--md-sys-typescale-label-small-font);
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface-variant);
    padding: 1px 8px;
    border: 2px solid var(--pr-ink);
    margin-left: 8px;
    vertical-align: middle;
  }

  /* Report Preview */
  .report-preview {
    position: relative;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .report-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font: var(--md-sys-typescale-label-small-font);
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
    padding: 2px 10px;
    border: 2px solid var(--pr-ink);
  }
  .rp-direction-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .rp-topic {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .rp-direction-badge {
    font: var(--md-sys-typescale-label-medium-font);
    padding: 2px 10px;
    border: 2px solid var(--pr-ink);
    font-weight: 600;
  }
  .rp-direction-badge.diverse {
    background: #E8F5E9;
    color: #2E7D32;
  }
  .rp-meta {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Source list */
  .rp-source-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding-top: 12px;
  }
  .rp-source-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface);
    flex-wrap: wrap;
  }
  .rp-camp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    align-self: center;
  }
  .rp-source-name {
    font-weight: 600;
    flex-shrink: 0;
    min-width: 56px;
  }
  .rp-camp-tag {
    font: var(--md-sys-typescale-label-small-font);
    padding: 0 6px;
    border: 1px solid;
    flex-shrink: 0;
  }
  .rp-camp-tag.green { border-color: #2E7D32; color: #2E7D32; }
  .rp-camp-tag.neutral { border-color: #757575; color: #757575; }
  .rp-camp-tag.blue { border-color: #1565C0; color: #1565C0; }
  .rp-bias {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
    min-width: 28px;
    text-align: right;
  }
  .rp-angle {
    color: var(--md-sys-color-on-surface-variant);
    flex: 1;
    min-width: 0;
  }

  /* Camp grid */
  .rp-camp-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding-top: 12px;
  }
  @media (max-width: 480px) {
    .rp-camp-grid { grid-template-columns: 1fr; }
  }
  .rp-camp-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px;
    border: 2px solid var(--pr-ink);
  }
  .rp-camp-card.green { border-left: 4px solid #2E7D32; }
  .rp-camp-card.neutral { border-left: 4px solid #757575; }
  .rp-camp-card.blue { border-left: 4px solid #1565C0; }
  .rp-camp-card-label {
    font: var(--md-sys-typescale-label-medium-font);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }
  .rp-camp-card-stat {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .rp-camp-card-mood {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Summary */
  .rp-summary {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding-top: 12px;
    line-height: 1.6;
  }
</style>
