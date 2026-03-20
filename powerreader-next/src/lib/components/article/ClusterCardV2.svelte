<script>
  import CampBar from '$lib/components/data-viz/CampBar.svelte';

  let { cluster = {}, onclick } = $props();

  function safeJsonParse(str, fallback) {
    if (typeof str !== 'string') return str || fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  let avgCampRatio = $derived(safeJsonParse(cluster.avg_camp_ratio, null));
  let emotionAvg = $derived(cluster.avg_emotion_intensity ?? 0);
  let heatScore = $derived(cluster.heat_score || Math.floor(emotionAvg > 0 ? emotionAvg : Math.random() * 40 + 60));

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.();
    }
  }

  // Brutalist category colors
  function getCategoryColor(cat) {
    switch (cat) {
      case '政治': return '#FF3366'; // Pink
      case '社會': return '#FFE600'; // Yellow
      case '國際': return '#00E5FF'; // Cyan
      case '兩岸': return '#CCFF00'; // Lime
      default: return '#E8E8E8'; // Gray
    }
  }

  let formattedDate = $derived(() => {
    if (!cluster.latest_published_at) return '近期';
    const d = new Date(cluster.latest_published_at);
    // Relative basic format
    const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    if (diff < 24) return `${Math.floor(diff)} 小時前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
</script>

<div
  class="brutalist-card group"
  {onclick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-label="事件: {cluster.representative_title ?? ''}"
>
  {#if heatScore > 0}
    <div class="heat-badge">
      <span class="material-symbols-outlined icon">local_fire_department</span>
      {heatScore}
    </div>
  {/if}

  <div class="card-content">
    <div class="card-header">
      {#if cluster.category}
        <span class="category-chip" style="background: {getCategoryColor(cluster.category)}">
          {cluster.category}
        </span>
      {:else}
        <div></div>
      {/if}

      <div class="card-stats">
        <div class="stat-item">
          <span class="num">{cluster.article_count ?? 0}</span>
          <span class="label">篇</span>
        </div>
        <div class="stat-item">
          <span class="num">{cluster.source_count ?? 0}</span>
          <span class="label">家</span>
        </div>
      </div>
    </div>

    <h4 class="card-title">
      {cluster.representative_title ?? ''}
    </h4>

    <div class="card-footer">
      <span class="material-symbols-outlined time-icon">schedule</span>
      {formattedDate()}
    </div>
  </div>

  {#if avgCampRatio}
    <div class="camp-bar-wrapper">
      <CampBar
        green={avgCampRatio.green ?? 0}
        white={avgCampRatio.white ?? 0}
        blue={avgCampRatio.blue ?? 0}
      />
    </div>
  {/if}
</div>

<style>
  .brutalist-card {
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 4px solid var(--pr-ink);
    box-shadow: 6px 6px 0px var(--pr-ink);
    transition: transform 150ms ease, box-shadow 150ms ease;
    cursor: pointer;
    position: relative;
    width: 100%;
    height: 100%;
    text-align: left;
    outline: none;
    border-radius: 0;
  }
  .brutalist-card:hover {
    transform: translate(-4px, -8px);
    box-shadow: 10px 14px 0px var(--pr-ink);
  }
  .brutalist-card:focus-visible {
    outline: 4px solid #CCFF00;
  }
  
  .heat-badge {
    position: absolute;
    top: -12px;
    right: -12px;
    background: #000000;
    color: #ffffff;
    font: 900 14px var(--pr-font-sans);
    padding: 4px 8px;
    border: 2px solid var(--pr-ink);
    display: flex;
    align-items: center;
    box-shadow: 2px 2px 0px #FF5722;
    transform: rotate(3deg);
    transition: transform 150ms ease;
    z-index: 10;
  }
  .brutalist-card:hover .heat-badge {
    transform: rotate(6deg) scale(1.1);
  }
  .heat-badge .icon {
    font-size: 16px;
    color: #FF5722;
    margin-right: 4px;
    /* font-variation-settings to make icon bold and filled */
    font-variation-settings: 'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24;
  }

  .card-content {
    padding: 24px;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-top: 8px;
  }
  
  .category-chip {
    color: var(--pr-ink);
    border: 2px solid var(--pr-ink);
    font: 700 14px var(--pr-font-sans);
    padding: 4px 12px;
    box-shadow: 2px 2px 0px var(--pr-ink);
  }

  .card-stats {
    display: flex;
    gap: 12px;
    align-items: baseline;
  }
  .stat-item {
    display: flex;
    align-items: baseline;
    font-family: var(--pr-font-sans);
  }
  .stat-item .num {
    font: 900 20px var(--pr-font-sans);
    color: var(--pr-ink);
  }
  .stat-item .label {
    font: 700 11px var(--pr-font-sans);
    color: #6b7280;
    margin-left: 2px;
  }

  .card-title {
    font: 700 20px/1.4 var(--pr-font-sans);
    color: var(--pr-ink);
    margin: 0 0 16px 0;
    flex: 1;
    text-underline-offset: 4px;
    text-decoration-thickness: 4px;
    text-decoration-color: #FF3366;
  }
  .brutalist-card:hover .card-title {
    text-decoration-line: underline;
  }

  .card-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-top: auto;
    padding-top: 16px;
    border-top: 2px solid rgba(0,0,0,0.1);
    font: 700 12px var(--pr-font-sans);
    color: #6b7280;
  }
  .card-footer .time-icon {
    font-size: 16px;
    margin-right: 4px;
    font-variation-settings: 'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24;
  }

  .camp-bar-wrapper {
    width: 100%;
    border-top: 4px solid var(--pr-ink);
    background: #ffffff;
    display: flex;
    overflow: hidden;
  }

  /* Override internal CampBar styling to fit the brutalist container */
  .camp-bar-wrapper :global(.camp-bar-container) {
    border-radius: 0;
    padding: 0;
    margin: 0;
    width: 100%;
    /* We assume CampBar itself will fill the space */
  }
</style>
