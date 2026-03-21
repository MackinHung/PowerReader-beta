/**
 * PowerReader - Store State Types
 *
 * Typed shapes for Svelte 5 rune store state.
 */

import type { Article } from './models.js';

export type SidebarMode = 'hidden' | 'rail' | 'expanded';

export interface PageOneCache {
  articles: Article[];
  hasMore: boolean;
}

export interface ExpandedArticles {
  [clusterId: string]: Article[];
}

export interface DailyQuota {
  used: number;
  limit: number;
  remaining: number;
}
