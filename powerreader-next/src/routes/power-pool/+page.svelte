<script>
  import Card from '$lib/components/ui/Card.svelte';
</script>

<div class="power-pool-page">
  <header class="page-header">
    <h1 class="page-title">動力池</h1>
    <p class="page-subtitle">正向飛輪 — 公民算力驅動的媒體分析生態</p>
  </header>

  <!-- Section 1: Flywheel Vision -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">cycle</span>
      飛輪願景
    </h2>
    <Card variant="elevated">
      <div class="flywheel-container">
        <div class="flywheel-ring">
          <div class="flywheel-step" style="--i: 0">
            <span class="material-symbols-outlined step-icon">memory</span>
            <span class="step-label">貢獻算力</span>
          </div>
          <div class="flywheel-step" style="--i: 1">
            <span class="material-symbols-outlined step-icon">toll</span>
            <span class="step-label">賺取點數</span>
          </div>
          <div class="flywheel-step" style="--i: 2">
            <span class="material-symbols-outlined step-icon">share</span>
            <span class="step-label">全網共享分析</span>
          </div>
          <div class="flywheel-step" style="--i: 3">
            <span class="material-symbols-outlined step-icon">campaign</span>
            <span class="step-label">更多人知道</span>
          </div>
          <div class="flywheel-step" style="--i: 4">
            <span class="material-symbols-outlined step-icon">group_add</span>
            <span class="step-label">更多人參與</span>
          </div>
          <!-- SVG circle connector -->
          <svg class="flywheel-svg" viewBox="0 0 300 300" aria-hidden="true">
            <circle cx="150" cy="150" r="110" class="flywheel-circle" />
            <!-- Arrow indicators -->
            <path d="M 260 150 L 252 143 M 260 150 L 252 157" class="flywheel-arrow" />
          </svg>
        </div>
        <p class="flywheel-desc">每一次分析都在推動飛輪旋轉，讓更多人看見媒體偏見。</p>
      </div>
    </Card>
  </section>

  <!-- Section 2: Sponsor & Subscribe -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">favorite</span>
      贊助與訂閱
    </h2>
    <Card variant="elevated">
      <div class="sponsor-card">
        <p class="sponsor-desc">透過贊助或訂閱支持平台永續運營，讓公民算力持續驅動。</p>
        <button class="sponsor-cta" disabled>
          <span class="material-symbols-outlined">lock</span>
          即將開放
        </button>
      </div>
    </Card>
  </section>

  <!-- Section 3: Transparency Plan -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">verified</span>
      獎池透明計劃
    </h2>
    <Card variant="elevated">
      <div class="transparency-card">
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">how_to_vote</span>
          <div class="item-content">
            <h3>分配權</h3>
            <p>所有獎池分配由社群投票決定，治理權歸屬貢獻者。</p>
          </div>
        </div>
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">visibility</span>
          <div class="item-content">
            <h3>透明度承諾</h3>
            <p>所有資金流向公開透明，定期發布審計報告。</p>
          </div>
        </div>
        <div class="transparency-item">
          <span class="material-symbols-outlined item-icon">groups</span>
          <div class="item-content">
            <h3>治理願景</h3>
            <p>點數可兌換分析報告、進階功能或實體獎品。最終邁向社群自治。</p>
          </div>
        </div>
      </div>
    </Card>
  </section>

  <!-- Section 4: Group Analysis Report Example -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">assessment</span>
      群體分析報告
    </h2>
    <p class="section-desc">當一個議題的所有文章分析完畢，自動生成綜合立場分布與偏見報告。</p>
    <Card variant="elevated">
      <div class="report-mock">
        <div class="report-badge">範例預覽</div>
        <h3 class="report-topic">議題：能源政策轉型</h3>

        <div class="report-section">
          <h4>立場分布</h4>
          <div class="stance-bars">
            <div class="stance-row">
              <span class="stance-label">泛綠</span>
              <div class="stance-bar-track">
                <div class="stance-bar-fill green" style="width: 42%"></div>
              </div>
              <span class="stance-pct">42%</span>
            </div>
            <div class="stance-row">
              <span class="stance-label">中立</span>
              <div class="stance-bar-track">
                <div class="stance-bar-fill white" style="width: 23%"></div>
              </div>
              <span class="stance-pct">23%</span>
            </div>
            <div class="stance-row">
              <span class="stance-label">泛藍</span>
              <div class="stance-bar-track">
                <div class="stance-bar-fill blue" style="width: 35%"></div>
              </div>
              <span class="stance-pct">35%</span>
            </div>
          </div>
        </div>

        <div class="report-section">
          <h4>偏見報告摘要</h4>
          <ul class="bias-findings">
            <li>泛綠媒體傾向強調「非核家園」與再生能源目標</li>
            <li>泛藍媒體多聚焦供電穩定性與經濟衝擊</li>
            <li>中立媒體相對均衡，但報導量較少</li>
            <li>整體偏見指數：中等（分歧度 38/100）</li>
          </ul>
        </div>
      </div>
    </Card>
  </section>
</div>

<style>
  .power-pool-page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }
  .page-header {
    text-align: center;
    padding: 8px 0;
  }
  .page-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .page-subtitle {
    margin: 4px 0 0;
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
  }
  .section-icon {
    font-size: 22px;
    color: var(--md-sys-color-primary);
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
    width: 300px;
    height: 300px;
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
  /* Position 5 steps around the circle (72° apart) */
  .flywheel-step:nth-child(1) { top: 5%;  left: 50%; }      /* top center */
  .flywheel-step:nth-child(2) { top: 33%; left: 95%; }      /* top right */
  .flywheel-step:nth-child(3) { top: 82%; left: 80%; }      /* bottom right */
  .flywheel-step:nth-child(4) { top: 82%; left: 20%; }      /* bottom left */
  .flywheel-step:nth-child(5) { top: 33%; left: 5%; }       /* top left */
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

  /* Sponsor */
  .sponsor-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px;
    text-align: center;
  }
  .sponsor-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    max-width: 400px;
  }
  .sponsor-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border: 3px solid var(--pr-ink);
    border-radius: 0;
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-label-large-font);
    cursor: not-allowed;
    opacity: 0.6;
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
  .bias-findings {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bias-findings li {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  @media (max-width: 480px) {
    .flywheel-ring {
      width: 260px;
      height: 260px;
    }
  }
</style>
