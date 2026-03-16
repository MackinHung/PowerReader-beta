<script>
  let { source = '', size = 'small' } = $props();

  const SOURCE_MAP = {
    liberty_times: { name: '自由時報', camp: 'green' },
    ltn: { name: '自由時報', camp: 'green' },
    rti: { name: '中央廣播', camp: 'green' },
    new_talk: { name: '新頭殼', camp: 'green' },
    民視新聞: { name: '民視新聞', camp: 'green' },
    set_news: { name: '三立新聞', camp: 'green' },
    udn: { name: '聯合新聞網', camp: 'blue' },
    chinatimes: { name: '中時新聞網', camp: 'blue' },
    china_times: { name: '中時新聞網', camp: 'blue' },
    tvbs: { name: 'TVBS', camp: 'blue' },
    ettoday: { name: 'ETtoday', camp: 'blue' },
    cna: { name: '中央社', camp: 'white' },
    pts: { name: '公視', camp: 'white' },
    storm: { name: '風傳媒', camp: 'white' },
    bcc: { name: '中廣', camp: 'white' },
    mirror_media: { name: '鏡週刊', camp: 'white' },
  };

  let info = $derived(SOURCE_MAP[source] ?? { name: source, camp: 'white' });
</script>

<span class="source-badge {size}" class:green={info.camp === 'green'} class:blue={info.camp === 'blue'} class:white={info.camp === 'white'}>
  <span class="camp-dot"></span>
  <span class="source-name">{info.name}</span>
</span>

<style>
  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--md-sys-shape-corner-extra-small);
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
  .camp-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .green .camp-dot { background: var(--camp-green); }
  .blue .camp-dot { background: var(--camp-blue); }
  .white .camp-dot { background: var(--camp-white); }
  .source-name {
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
