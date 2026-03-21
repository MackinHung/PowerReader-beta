/**
 * PowerReader - Inference Fingerprint
 *
 * Generates cryptographic fingerprints for analysis results, proving they
 * were produced by the AI inference pipeline without human intervention.
 *
 * Fingerprint includes: model ID, prompt hash (SHA-256), token counts,
 * generation timing, and GPU tier — all natural byproducts of inference
 * that are statistically difficult to fabricate.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { InferenceFingerprint, GPUTier } from '$lib/types/inference.js';
import { getDeviceTier, getUserGPUSelection, getCachedBenchmark } from './benchmark.js';

/**
 * SHA-256 hash of concatenated prompt strings.
 * Uses Web Crypto API (available in all modern browsers).
 */
export async function hashPrompts(...inputs: string[]): Promise<string> {
  const data = new TextEncoder().encode(inputs.join('\n---\n'));
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface FingerprintInput {
  modelId: string;
  promptHash: string;
  pass1Tokens: number;
  pass2Tokens: number;
  pass1TimeMs: number;
  pass2TimeMs: number;
}

/**
 * Build an InferenceFingerprint from raw inference metrics.
 * GPU tier and device are read from the cached benchmark result.
 */
export function buildFingerprint(input: FingerprintInput): InferenceFingerprint {
  const tier = getDeviceTier();
  const userGpu = getUserGPUSelection();
  const benchmark = getCachedBenchmark();
  const totalTokens = input.pass1Tokens + input.pass2Tokens;
  const totalTimeSec = (input.pass1TimeMs + input.pass2TimeMs) / 1000;

  return {
    model_id: input.modelId,
    prompt_hash: input.promptHash,
    pass1_tokens: input.pass1Tokens,
    pass2_tokens: input.pass2Tokens,
    pass1_time_ms: input.pass1TimeMs,
    pass2_time_ms: input.pass2TimeMs,
    tokens_per_second: totalTimeSec > 0
      ? Math.round((totalTokens / totalTimeSec) * 100) / 100
      : 0,
    gpu_tier: tier,
    gpu_device: userGpu?.device ?? benchmark?.gpu_info?.device ?? '',
    timestamp: new Date().toISOString(),
  };
}
