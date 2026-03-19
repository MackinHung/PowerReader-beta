/**
 * PowerReader - API Types
 *
 * Typed API response/request shapes used by core/api.ts and all consumers.
 */

export interface ApiError {
  type: string;
  status?: number;
  message?: string;
}

export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ApiError };

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface FetchArticlesParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: string;
  source?: string;
  category?: string;
}

export interface FetchEventsParams {
  page?: number;
  limit?: number;
  type?: string;
}

export interface FetchBlindspotEventsParams {
  page?: number;
  limit?: number;
  type?: string;
}

export interface SearchArticlesParams {
  page?: number;
  limit?: number;
}

export interface FetchContributionsParams {
  page?: number;
  limit?: number;
  days?: number;
}

export interface FetchKnowledgeListParams {
  page?: number;
  limit?: number;
  type?: string;
  party?: string;
}

export interface SearchKnowledgeParams {
  topK?: number;
  type?: string;
}

export type ReportReason = string;

export interface FetchClustersParams {
  page?: number;
  limit?: number;
  category?: string;
}

export type FeedbackType = 'like' | 'dislike';

export interface SubmitAnalysisPayload {
  bias_score: number;
  controversy_score: number;
  camp_ratio: CampRatio | null;
  is_political: boolean;
  emotion_intensity: number;
  points: string[];
  reasoning: string;
  key_phrases: string[];
  prompt_version: string;
  mode: string;
  latency_ms: number;
}

export interface CampRatio {
  green: number;
  white: number;
  blue: number;
  gray: number;
}
