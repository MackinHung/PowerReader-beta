/**
 * Share Card Types
 *
 * Data interfaces for Canvas card rendering.
 */

import type { CampRatio } from '$lib/types/api.js';

export interface ArticleCardData {
  readonly title: string;
  readonly source: string;
  readonly biasScore: number | null;
  readonly isPolitical: boolean;
  readonly campRatio: CampRatio | null;
  readonly emotionIntensity: number | null;
  readonly points: readonly string[];
}

export interface EventCardData {
  readonly title: string;
  readonly articleCount: number;
  readonly sourceCount: number;
  readonly campDistribution: CampRatio | null;
  readonly blindspotType: string | null;
  readonly analysisProgress: {
    readonly analyzed: number;
    readonly total: number;
  };
}

export interface ShareResult {
  readonly method: 'native' | 'download';
  readonly success: boolean;
}
