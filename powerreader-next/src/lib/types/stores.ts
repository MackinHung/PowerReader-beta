/**
 * PowerReader - Store State Types
 *
 * Typed shapes for Svelte 5 rune store state.
 */

import type { Article, BlindspotEvent, EventCluster, UserProfile, UserPoints } from './models.js';
import type {
  GPUScanResult,
  BenchmarkResult,
  QueueStatus,
  AutoRunnerStatus,
  AnalysisStage,
  PreDownloadChecks
} from './inference.js';
import type { ApiError } from './api.js';

export type SidebarMode = 'hidden' | 'rail' | 'expanded';

export type AnalysisModeOption = 'auto' | 'manual';

export type ThemeOption = 'light' | 'dark' | 'system';

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
