/**
 * PowerReader - Source Brand Map
 *
 * Centralized mapping of news source IDs to brand identity (name, icon, color).
 * Shared across SourceBadge, SourceIcon, and any component displaying source names.
 */

export interface SourceInfo {
  name: string;
  icon: string;
  color: string;
}

export const SOURCE_MAP: Record<string, SourceInfo> = {
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

const DEFAULT_COLOR = '#666666';

/** Resolve source info from a source ID or display name. */
export function getSourceInfo(source: string): SourceInfo {
  if (SOURCE_MAP[source]) return SOURCE_MAP[source];

  // Try matching by display name (e.g., "自由時報" → liberty_times)
  for (const info of Object.values(SOURCE_MAP)) {
    if (info.name === source) return info;
  }

  return { name: source, icon: (source || '?').charAt(0), color: DEFAULT_COLOR };
}
