<script>
  import Card from '$lib/components/ui/Card.svelte';
  import EmotionMeter from '$lib/components/data-viz/EmotionMeter.svelte';
  import { t } from '$lib/i18n/zh-TW.js';

  /** @type {import('$lib/types/models.js').GroupAnalysisResult | null} */
  let { report = null } = $props();

  const CAMP_COLORS = {
    green: '#2E7D32',
    white: '#757575',
    blue: '#1565C0',
    gray: '#9E9E9E',
  };

  const CAMP_LABELS = {
    green: '泛綠',
    white: '中立',
    blue: '泛藍',
    gray: '無陣營',
  };

  const DIRECTION_COLORS = {
    '偏綠': '#2E7D32',
    '偏藍': '#1565C0',
    '中立': '#757575',
    '多元': '#FF9800',
  };
</script>

{#if report}
  <div class="group-report">
    <!-- Direction Badge -->
    <div class="direction-row">
      <span class="direction-label">{t('group.bias_direction')}</span>
      <span
        class="direction-badge"
        style="background: {DIRECTION_COLORS[report.bias_direction] || '#757575'}20;
               color: {DIRECTION_COLORS[report.bias_direction] || '#757575'};
               border-color: {DIRECTION_COLORS[report.bias_direction] || '#757575'}40"
      >
        {report.bias_direction}
      </span>
      <span class="meta-text">{report.total_articles} 篇 · {report.total_sources} 家媒體</span>
    </div>

    <!-- Source Breakdowns -->
    <Card variant="filled">
      <div class="section">
        <span class="section-label">{t('group.source_breakdown')}</span>
        <div class="source-list">
          {#each report.source_breakdowns as bd}
            <div class="source-row">
              <span class="camp-dot" style="background: {CAMP_COLORS[bd.camp]}"></span>
              <span class="source-name">{bd.source}</span>
              <span class="source-camp" style="color: {CAMP_COLORS[bd.camp]}">
                {CAMP_LABELS[bd.camp]}
              </span>
              <span class="source-bias">{bd.bias_score}</span>
            </div>
            {#if bd.summary}
              <p class="source-summary">{bd.summary}</p>
            {/if}
          {/each}
        </div>
      </div>
    </Card>

    <!-- Camp Statistics -->
    {#if report.camp_statistics.length > 0}
      <Card variant="filled">
        <div class="section">
          <span class="section-label">{t('group.camp_stats')}</span>
          <div class="camp-stats-grid">
            {#each report.camp_statistics as stat}
              <div class="camp-stat-card" style="border-left: 3px solid {CAMP_COLORS[stat.camp]}">
                <div class="camp-stat-header">
                  <span class="camp-stat-name" style="color: {CAMP_COLORS[stat.camp]}">
                    {CAMP_LABELS[stat.camp]}
                  </span>
                  <span class="camp-stat-count">{stat.article_count} 篇</span>
                </div>
                <div class="camp-stat-metrics">
                  <span>偏向: {stat.avg_bias_score}</span>
                </div>
                <EmotionMeter intensity={stat.avg_emotion_intensity} />
              </div>
            {/each}
          </div>
        </div>
      </Card>
    {/if}

    <!-- Group Summary -->
    {#if report.group_summary}
      <Card variant="filled">
        <div class="section">
          <span class="section-label">{t('group.summary')}</span>
          <p class="group-summary-text">{report.group_summary}</p>
        </div>
      </Card>
    {/if}
  </div>
{/if}

<style>
  .group-report {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .direction-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .direction-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .direction-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: var(--md-sys-shape-corner-small);
    border: 1px solid;
    font: var(--md-sys-typescale-label-medium-font);
    font-weight: 600;
  }
  .meta-text {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-label {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Source Breakdowns */
  .source-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .source-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
  }
  .camp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .source-name {
    flex: 1;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .source-camp {
    font: var(--md-sys-typescale-label-small-font);
    white-space: nowrap;
  }
  .source-bias {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    min-width: 24px;
    text-align: right;
  }
  .source-summary {
    margin: 0 0 4px 16px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
  }

  /* Camp Statistics */
  .camp-stats-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @media (min-width: 768px) {
    .camp-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
  }
  .camp-stat-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--md-sys-color-surface-container-lowest);
    border-radius: var(--md-sys-shape-corner-small);
  }
  .camp-stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .camp-stat-name {
    font: var(--md-sys-typescale-label-large-font);
    font-weight: 600;
  }
  .camp-stat-count {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .camp-stat-metrics {
    display: flex;
    gap: 12px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Group Summary */
  .group-summary-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    line-height: 1.6;
  }
</style>
