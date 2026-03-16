<script>
  import Card from '$lib/components/ui/Card.svelte';
  import SourceBadge from './SourceBadge.svelte';
  import BiasSpectrum from '$lib/components/data-viz/BiasSpectrum.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';

  let { article = {} } = $props();

  const STATUS_COLORS = {
    none: 'var(--md-sys-color-outline)',
    pending: 'var(--md-sys-color-tertiary)',
    done: 'var(--camp-green)',
  };

  let statusColor = $derived(STATUS_COLORS[article.analysis_status ?? 'none'] ?? STATUS_COLORS.none);

  let formattedDate = $derived(() => {
    if (!article.published_at) return '';
    const d = new Date(article.published_at);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
</script>

<a href="/article/{article.article_hash}" class="article-card-link">
  <Card variant="elevated">
    <div class="card-inner">
      <div class="card-top">
        <SourceBadge source={article.source} />
        <span class="date">{formattedDate()}</span>
        <span class="status-dot" style="background: {statusColor}"></span>
      </div>
      <h3 class="card-title">{article.title ?? ''}</h3>
      <div class="card-bottom">
        {#if article.bias_score != null}
          <div class="mini-spectrum">
            <BiasSpectrum score={article.bias_score} />
          </div>
        {/if}
        {#if article.camp_ratio}
          <div class="mini-camp">
            <CampBar
              green={article.camp_ratio?.green ?? 0}
              white={article.camp_ratio?.white ?? 0}
              blue={article.camp_ratio?.blue ?? 0}
            />
          </div>
        {/if}
      </div>
    </div>
  </Card>
</a>

<style>
  .article-card-link {
    text-decoration: none;
    color: inherit;
    display: block;
  }
  .card-inner {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .date {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: auto;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .card-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }
  .card-bottom {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mini-spectrum {
    max-width: 180px;
  }
  .mini-camp {
    width: 100%;
  }
</style>
