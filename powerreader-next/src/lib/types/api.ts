/**
 * PowerReader - API Types
 *
 * Typed API response/request shapes used by core/api.ts and all consumers.
 */

import type { InferenceFingerprint } from './inference.js';

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

export interface FetchClustersParams {
  page?: number;
  limit?: number;
  category?: string;
}

export type FeedbackType = 'like' | 'dislike';

export interface SubmitAnalysisPayload {
  bias_score: number;
  camp_ratio: CampRatio | null;
  is_political: boolean;
  emotion_intensity: number;
  points: string[];
  reasoning: string;
  key_phrases: string[];
  prompt_version: string;
  mode: string;
  latency_ms: number;
  fingerprint?: InferenceFingerprint;
}

export interface CampRatio {
  green: number;
  white: number;
  blue: number;
  gray: number;
}

// =============================================
// Sponsor API (ECPay — Power Pool)
// =============================================

export type SponsorType = 'coffee' | 'civic' | 'compute' | 'proxy';

export interface SponsorOrder {
  amount: number;
  type: SponsorType;
}

export interface SponsorFormResponse {
  form_params: Record<string, string>;
  action_url: string;
}

export interface SponsorStats {
  total_amount: number;
  total_count: number;
  by_type: Record<SponsorType, { count: number; amount: number }>;
  pools: { developer: number; platform: number; compute: number };
}

export interface Sponsorship {
  merchant_trade_no: string;
  amount: number;
  sponsor_type: SponsorType;
  status: 'pending' | 'paid' | 'failed';
  created_at: string;
  paid_at: string | null;
}

// =============================================
// Point Shop API
// =============================================

export type ShopItemCategory = 'cosmetic' | 'functional';

export interface ShopItem {
  id: string;
  name_key: string;
  description_key: string;
  cost_cents: number;
  category: ShopItemCategory;
  icon: string;
  is_consumable: number;
  duration_hours: number | null;
  max_per_user: number | null;
  display_order: number;
}

export interface PurchaseResponse {
  item_id: string;
  cost_cents: number;
  remaining_points_cents: number;
  display_remaining: string;
  expires_at: string | null;
}

export interface InventoryItem {
  purchase_id: number;
  item_id: string;
  cost_cents: number;
  purchased_at: string;
  expires_at: string | null;
  is_consumed: number;
  consumed_at: string | null;
  name_key: string;
  description_key: string;
  category: ShopItemCategory;
  icon: string;
  is_consumable: number;
  is_active: boolean;
}

export interface UseItemResponse {
  purchase_id: number;
  item_id: string;
  effect_applied: boolean;
}
