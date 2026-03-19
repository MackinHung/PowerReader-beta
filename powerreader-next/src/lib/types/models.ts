/**
 * PowerReader - Domain Model Types
 *
 * Core domain entities used across the application.
 */

import type { CampRatio } from './api.js';

export interface Article {
  article_id: string;
  article_hash?: string;
  title: string;
  summary: string;
  content_markdown: string;
  source: string;
  primary_url: string;
  duplicate_urls?: string[];
  published_at: string;
  crawled_at?: string;
  author?: string | null;
  char_count?: number;
  filter_score?: number;
  matched_topic?: string;
  cached_at?: string;
  status?: string;
  dedup_metadata?: {
    total_found: number;
    unique_content: number;
    similarity_scores: number[];
  };
}

export interface AnalysisResult {
  bias_score: number;
  controversy_score: number;
  camp_ratio: CampRatio | null;
  points: string[];
  reasoning: string;
  key_phrases: string[];
  prompt_version: string;
  mode: string;
  latency_ms: number;
  knowledgeEntries?: KnowledgeEntry[];
  _debug?: Record<string, unknown>;
}

export interface ScoreOutput {
  bias_score: number;
  controversy_score: number;
  camp_ratio: CampRatio | null;
}

export interface NarrativeOutput {
  points: string[];
  key_phrases: string[];
}

export interface KnowledgeEntry {
  id: string;
  type: string;
  title: string;
  content: string;
  party?: string;
  score?: number;
}

export interface UserProfile {
  user_hash: string;
  display_name?: string;
  created_at?: string;
  login_provider?: string;
}

export interface UserPoints {
  total_points: number;
  daily_analysis_count: number;
  daily_analysis_limit: number;
  vote_rights: number;
  rank?: number;
}

export interface Contribution {
  article_id: string;
  points_earned: number;
  created_at: string;
}

export interface BlindspotEvent {
  event_id: string;
  title: string;
  description?: string;
  article_count: number;
  sources: string[];
  created_at: string;
}

export interface EventCluster {
  cluster_id: string;
  title: string;
  description?: string;
  article_ids: string[];
  article_count: number;
  category?: string;
  created_at: string;
}

export interface SourceProfile {
  source: string;
  avg_bias_score: number;
  article_count: number;
}

export type BiasCategory =
  | 'extreme_left'
  | 'left'
  | 'center_left'
  | 'center'
  | 'center_right'
  | 'right'
  | 'extreme_right';

export type ControversyLevel =
  | 'non_political'
  | 'general_policy'
  | 'partisan_clash'
  | 'core_conflict'
  | 'national_security';
