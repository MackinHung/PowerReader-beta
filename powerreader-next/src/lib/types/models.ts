/**
 * PowerReader - Domain Model Types
 *
 * Core domain entities used across the application.
 */

import type { CampRatio } from './api.js';
import type { InferenceFingerprint } from './inference.js';

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
  camp_ratio: CampRatio | null;
  is_political: boolean;
  emotion_intensity: number;
  points: string[];
  reasoning: string;
  key_phrases: string[];
  source_attribution: string;
  stances: Record<string, string>;
  prompt_version: string;
  mode: string;
  latency_ms: number;
  knowledgeEntries?: KnowledgeEntry[];
  fingerprint?: InferenceFingerprint;
  _debug?: Record<string, unknown>;
}

export interface ScoreOutput {
  bias_score: number;
  camp_ratio: CampRatio | null;
  is_political: boolean;
  emotion_intensity: number;
}

export interface NarrativeOutput {
  points: string[];
  key_phrases: string[];
  stances: Record<string, string>;
}

/** Shared base fields for all knowledge entries */
export interface KnowledgeBase {
  id: string;
  type: string;
  title: string;
  content?: string;                // backward compat (legacy flat content)
  source_type?: 'ai' | 'human' | 'community';
  report_count?: number;
  score?: number;
  _batch?: string;
}

/** 政治人物 (figure) — was "politician" */
export interface FigureEntry extends KnowledgeBase {
  type: 'figure' | 'politician';
  party?: 'KMT' | 'DPP' | 'TPP' | 'NPP' | 'TSP';
  period?: string;       // 任期 (title+period+background sum ≤120)
  background?: string;   // 背景 (title+period+background sum ≤120)
}

/** 國家議題 (issue) — was "topic" */
export interface IssueEntry extends KnowledgeBase {
  type: 'issue' | 'topic';
  description?: string;  // 中立客觀描述 ≤50字
  stances?: {
    DPP: string;
    KMT: string;
    TPP: string;
  };
}

/** 社會事件 (incident) — was "event" */
export interface IncidentEntry extends KnowledgeBase {
  type: 'incident' | 'event';
  date?: string;         // ISO 日期 (title+date+desc+kw sum ≤120)
  description?: string;  // 事件描述 (title+date+desc+kw sum ≤120)
  keywords?: string[];   // 關鍵字陣列 (title+date+desc+kw sum ≤120)
}

/** Union type for all knowledge entries */
export type KnowledgeEntry = FigureEntry | IssueEntry | IncidentEntry | KnowledgeBase;

export interface UserProfile {
  user_hash: string;
  display_name?: string;
  avatar_url?: string;
  role?: string;
  member_since?: string;
  contribution_count?: number;
  display_points?: string;
  created_at?: string;
  login_provider?: string;
}

export interface UserPoints {
  total_points: number;
  total_points_cents?: number;
  display_points?: string;
  contribution_count?: number;
  daily_analysis_count: number;
  daily_analysis_limit: number;
  vote_rights: number;
  last_contribution_at?: string;
  rank?: number;
}

export interface Contribution {
  article_id: string;
  points_earned: number;
  created_at: string;
  title?: string;
  status?: string;
}

export interface BlindspotEvent {
  event_id: string;
  title: string;
  description?: string;
  article_count: number;
  sources: string[];
  created_at: string;
}

export interface SubCluster {
  representative_title: string;
  article_ids: string[];
  article_count: number;
}

export interface EventCluster {
  cluster_id: string;
  title: string;
  description?: string;
  article_ids: string[];
  article_count: number;
  category?: string;
  created_at: string;
  sub_clusters?: SubCluster[];
  sub_cluster_count?: number;
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

// ── Group Analysis Types ──

export type CampType = 'green' | 'white' | 'blue' | 'gray';

export interface SourceBreakdown {
  source: string;
  camp: CampType;
  bias_score: number;
  emotion_intensity: number;
  summary: string;
}

export interface CampStatistics {
  camp: CampType;
  avg_bias_score: number;
  avg_emotion_intensity: number;
  article_count: number;
  sources: string[];
}

export interface GroupAnalysisResult {
  cluster_id: string;
  analyzed_at: string;
  source_breakdowns: SourceBreakdown[];
  camp_statistics: CampStatistics[];
  group_summary: string;
  bias_direction: string;
  total_articles: number;
  total_sources: number;
  prompt_version: string;
}
