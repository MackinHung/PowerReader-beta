/**
 * PowerReader - Inference Pipeline Types
 *
 * Types for the WebGPU/server inference engine, benchmark, queue, and auto-runner.
 */

import type { Article, AnalysisResult, KnowledgeEntry } from './models.js';

export type InferenceMode = 'webgpu' | 'server';

export type GPUTier = 'gpu' | 'cpu' | 'none';

export type AnalysisStage =
  | 'preparing'
  | 'loading_model'
  | 'pass1_running'
  | 'pass1_done'
  | 'pass2_running'
  | 'pass2_done'
  | 'fallback_to_server'
  | 'running'
  | 'generating'
  | 'done';

export type StatusCallback = (
  stage: AnalysisStage,
  elapsedMs: number,
  extra?: { eta?: number | null; progress?: number }
) => void;

export interface AnalysisOptions {
  mode?: InferenceMode;
  onStatus?: StatusCallback;
  signal?: AbortSignal;
}

export interface AnalysisRunOptions {
  article: Article;
  knowledgeEntries: KnowledgeEntry[];
  mode?: InferenceMode;
  onStatus?: StatusCallback;
  signal?: AbortSignal;
}

export interface QueueStatus {
  currentJob: { articleId: string; startedAt: number } | null;
  pending: string[];
}

export interface QueueJob {
  articleId: string;
  article: Article;
  options: AnalysisOptions;
  resolve: (value: AnalysisResult) => void;
  reject: (reason: unknown) => void;
}

export interface BenchmarkResult {
  mode: GPUTier;
  latency_ms: number;
  gpu_info: GPUScanResult | null;
  tested_at: string;
}

export interface GPUScanResult {
  supported: boolean;
  vendor: string;
  architecture: string;
  device: string;
  vramMB: number;
  gpuType: 'discrete' | 'integrated' | 'unified' | 'unknown';
  archInfo: { label: string; vramRange: string; series: string } | null;
}

export interface PreDownloadCheck {
  name: string;
  ok: boolean;
  reason?: string;
  availableMB?: number;
}

export interface PreDownloadChecks {
  canDownload: boolean;
  checks: PreDownloadCheck[];
}

export interface AutoRunnerStatus {
  running: boolean;
  paused: boolean;
  analyzed: number;
  failed: number;
  skipped: number;
  currentArticle: { id: string; title: string } | null;
  startedAt: number | null;
  stopReason: string | null;
}

export interface AutoRunnerStats {
  analyzed: number;
  skipped: number;
  failed: number;
}

export interface EtaEstimate {
  remainingMs: number;
  confidence: number;
}

export interface BrowserInfo {
  name: string;
  version: number;
  webgpuMinVersion: number;
  isCompatible: boolean;
  message: string;
}

/** Cryptographic fingerprint proving an analysis was produced by the inference pipeline */
export interface InferenceFingerprint {
  model_id: string;
  prompt_hash: string;           // SHA-256 of concatenated system+user prompts
  pass1_tokens: number;          // completion tokens from Pass 1
  pass2_tokens: number;          // completion tokens from Pass 2
  pass1_time_ms: number;         // Pass 1 wall-clock duration
  pass2_time_ms: number;         // Pass 2 wall-clock duration
  tokens_per_second: number;     // total completion tokens / total inference seconds
  gpu_tier: GPUTier;             // gpu | cpu | none
  gpu_device: string;            // device name from benchmark
  timestamp: string;             // ISO 8601
}
