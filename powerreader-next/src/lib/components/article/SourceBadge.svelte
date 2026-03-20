<script>
  /**
   * SourceBadge — neutral media source badge with brand icon.
   * No political camp coloring — shows media identity only.
   */
  let { source = '', size = 'small' } = $props();

  const SOURCE_MAP = {
    liberty_times: { name: '自由時報', icon: '自' },
    ltn: { name: '自由時報', icon: '自' },
    rti: { name: '中央廣播', icon: '央' },
    new_talk: { name: '新頭殼', icon: '新' },
    民視新聞: { name: '民視新聞', icon: '民' },
    set_news: { name: '三立新聞', icon: '三' },
    udn: { name: '聯合新聞網', icon: '聯' },
    chinatimes: { name: '中時新聞網', icon: '中' },
    china_times: { name: '中時新聞網', icon: '中' },
    tvbs: { name: 'TVBS', icon: 'T' },
    ettoday: { name: 'ETtoday', icon: 'E' },
    cna: { name: '中央社', icon: '社' },
    pts: { name: '公視', icon: '公' },
    storm: { name: '風傳媒', icon: '風' },
    bcc: { name: '中廣', icon: '廣' },
    mirror_media: { name: '鏡週刊', icon: '鏡' },
    ebc: { name: '東森新聞', icon: '東' },
    ttv: { name: '台視新聞', icon: '台' },
    ctv: { name: '中視新聞', icon: '視' },
    cts: { name: '華視新聞', icon: '華' },
    cnews: { name: '匯流新聞', icon: '匯' },
  };

  let info = $derived(SOURCE_MAP[source] ?? { name: source, icon: (source || '?').charAt(0) });
</script>

<span class="source-badge {size}">
  <span class="brand-icon">{info.icon}</span>
  <span class="source-name">{info.name}</span>
</span>

<style>
  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
    background: var(--md-sys-color-surface-container);
    white-space: nowrap;
  }
  .small {
    padding: 2px 8px;
    font: var(--md-sys-typescale-label-small-font);
  }
  .medium {
    padding: 4px 12px;
    font: var(--md-sys-typescale-label-large-font);
  }
  .brand-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 0;
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
    line-height: 1;
  }
  .small .brand-icon {
    width: 14px;
    height: 14px;
    font-size: 9px;
  }
  .source-name {
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
