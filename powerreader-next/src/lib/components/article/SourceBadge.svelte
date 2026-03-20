<script>
  /**
   * SourceBadge — neutral media source badge with brand icon.
   * No political camp coloring — shows media identity only.
   */
  let { source = '', size = 'small' } = $props();

  const SOURCE_MAP = {
    liberty_times: { name: '自由時報', icon: '自', color: '#1B9431' },
    ltn: { name: '自由時報', icon: '自', color: '#1B9431' },
    rti: { name: '中央廣播', icon: '央', color: '#0066CC' },
    new_talk: { name: '新頭殼', icon: '新', color: '#00AA44' },
    民視新聞: { name: '民視新聞', icon: '民', color: '#0072C6' },
    set_news: { name: '三立新聞', icon: '三', color: '#FF6600' },
    udn: { name: '聯合新聞網', icon: '聯', color: '#003399' },
    chinatimes: { name: '中時新聞網', icon: '中', color: '#CC0000' },
    china_times: { name: '中時新聞網', icon: '中', color: '#CC0000' },
    tvbs: { name: 'TVBS', icon: 'T', color: '#0056A0' },
    ettoday: { name: 'ETtoday', icon: 'E', color: '#ED1B23' },
    cna: { name: '中央社', icon: '社', color: '#003366' },
    pts: { name: '公視', icon: '公', color: '#005BAC' },
    storm: { name: '風傳媒', icon: '風', color: '#1E88E5' },
    bcc: { name: '中廣', icon: '廣', color: '#CC3333' },
    mirror_media: { name: '鏡週刊', icon: '鏡', color: '#1A1A1A' },
    ebc: { name: '東森新聞', icon: '東', color: '#E50012' },
    ttv: { name: '台視新聞', icon: '台', color: '#006633' },
    ctv: { name: '中視新聞', icon: '視', color: '#0055AA' },
    cts: { name: '華視新聞', icon: '華', color: '#E60012' },
    cnews: { name: '匯流新聞', icon: '匯', color: '#333333' },
  };

  let info = $derived(SOURCE_MAP[source] ?? { name: source, icon: (source || '?').charAt(0), color: '#666666' });
</script>

<span class="source-badge {size}">
  <span class="brand-icon" style="background: {info.color}">{info.icon}</span>
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
    width: 20px;
    height: 20px;
    border-radius: 0;
    background: #666;
    color: #FFFFFF;
    font-size: 11px;
    font-weight: 900;
    flex-shrink: 0;
    line-height: 1;
    border: 1px solid var(--pr-ink);
  }
  .small .brand-icon {
    width: 18px;
    height: 18px;
    font-size: 10px;
  }
  .source-name {
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
