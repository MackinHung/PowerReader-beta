/**
 * Unit tests for inference.js
 *
 * Tests cover: INFERENCE_MODES, hasWebGPU, detectBestMode, getModeLabel,
 *              runAnalysis, clearAllModelCaches
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all static imports used by inference.js ──

vi.mock('../../src/lib/i18n/zh-TW.js', () => ({
  t: (key) => key,
}));

vi.mock('../../src/lib/core/prompt.js', () => ({
  assembleScoreSystemPrompt: vi.fn(() => 'score-system-prompt'),
  assembleNarrativeSystemPrompt: vi.fn(() => 'narrative-system-prompt'),
  assembleUserMessage: vi.fn(() => 'user-message'),
}));

vi.mock('../../src/lib/core/output-parser.js', () => ({
  parseScoreOutput: vi.fn(() => ({ bias_score: 50, camp_ratio: null, is_political: true, emotion_intensity: 50 })),
  parseNarrativeOutput: vi.fn(() => ({ points: ['p1'], key_phrases: ['k1'], stances: {} })),
}));

// ── Dynamic module import helper ──
// inference.js has module-level singleton state, so we use
// vi.resetModules() + dynamic import to get a fresh copy per test group.

let inferenceModule;

async function loadInferenceModule() {
  const mod = await import('../../src/lib/core/inference.js');
  return mod;
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  delete globalThis.navigator.gpu;
  globalThis.fetch = vi.fn();
  // Re-register the mocks after resetModules
  vi.mock('../../src/lib/i18n/zh-TW.js', () => ({
    t: (key) => key,
  }));
  vi.mock('../../src/lib/core/prompt.js', () => ({
    assembleScoreSystemPrompt: vi.fn(() => 'score-system-prompt'),
    assembleNarrativeSystemPrompt: vi.fn(() => 'narrative-system-prompt'),
    assembleUserMessage: vi.fn(() => 'user-message'),
  }));
  vi.mock('../../src/lib/core/output-parser.js', () => ({
    parseScoreOutput: vi.fn(() => ({ bias_score: 50, camp_ratio: null, is_political: true, emotion_intensity: 50 })),
    parseNarrativeOutput: vi.fn(() => ({ points: ['p1'], key_phrases: ['k1'], stances: {} })),
    parseAnalysisOutput: vi.fn(() => ({ bias_score: 50 })),
  }));
  inferenceModule = await loadInferenceModule();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.navigator.gpu;
});

// ══════════════════════════════════════════════
// 1. INFERENCE_MODES
// ══════════════════════════════════════════════

describe('INFERENCE_MODES', () => {
  it('has WEBGPU = "webgpu"', () => {
    expect(inferenceModule.INFERENCE_MODES.WEBGPU).toBe('webgpu');
  });

  it('has SERVER = "server"', () => {
    expect(inferenceModule.INFERENCE_MODES.SERVER).toBe('server');
  });
});

// ══════════════════════════════════════════════
// 2. hasWebGPU
// ══════════════════════════════════════════════

describe('hasWebGPU', () => {
  it('returns false when navigator.gpu does not exist', async () => {
    delete globalThis.navigator.gpu;

    const result = await inferenceModule.hasWebGPU();

    expect(result).toBe(false);
  });

  it('returns false when requestAdapter returns null', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(null),
    };

    const result = await inferenceModule.hasWebGPU();

    expect(result).toBe(false);
  });

  it('returns true when requestAdapter returns a valid adapter', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue({ name: 'test-adapter' }),
    };

    const result = await inferenceModule.hasWebGPU();

    expect(result).toBe(true);
  });

  it('returns false when requestAdapter throws', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockRejectedValue(new Error('GPU init failed')),
    };

    const result = await inferenceModule.hasWebGPU();

    expect(result).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 3. detectBestMode
// ══════════════════════════════════════════════

describe('detectBestMode', () => {
  it('returns "webgpu" when hasWebGPU is true', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue({ name: 'test' }),
    };

    const result = await inferenceModule.detectBestMode();

    expect(result).toBe('webgpu');
  });

  it('returns "server" when hasWebGPU is false', async () => {
    delete globalThis.navigator.gpu;

    const result = await inferenceModule.detectBestMode();

    expect(result).toBe('server');
  });
});

// ══════════════════════════════════════════════
// 4. getModeLabel
// ══════════════════════════════════════════════

describe('getModeLabel', () => {
  it('returns t("model.inference.webgpu") for webgpu mode', () => {
    const result = inferenceModule.getModeLabel('webgpu');
    expect(result).toBe('model.inference.webgpu');
  });

  it('returns t("model.inference.server") for server mode', () => {
    const result = inferenceModule.getModeLabel('server');
    expect(result).toBe('model.inference.server');
  });

  it('returns the raw mode string for unknown modes', () => {
    expect(inferenceModule.getModeLabel('unknown_mode')).toBe('unknown_mode');
    expect(inferenceModule.getModeLabel('')).toBe('');
  });
});

// ══════════════════════════════════════════════
// 5. runAnalysis
// ══════════════════════════════════════════════

describe('runAnalysis', () => {
  it('uses server mode and returns result from fetch when mode="server"', async () => {
    const serverResponse = {
      bias_score: 65,
      points: ['point1', 'point2'],
      reasoning: 'some reasoning',
      key_phrases: ['kp1'],
      stances: {},
      prompt_version: 'v4.2.0',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(serverResponse),
    });

    const onStatus = vi.fn();
    const result = await inferenceModule.runAnalysis({
      article: { content_markdown: 'test content' },
      knowledgeEntries: [],
      mode: 'server',
      onStatus,
    });

    expect(result.mode).toBe('server');
    expect(result.bias_score).toBe(65);
    expect(result.points).toEqual(['point1', 'point2']);
    expect(result.stances).toEqual({});
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('falls back to server when WebGPU inference fails', async () => {
    // mode='webgpu' is passed explicitly. getWebLLMEngine will fail
    // (CDN unavailable in tests), triggering the server fallback.

    const serverResponse = {
      bias_score: 55,
      points: ['fallback point'],
      reasoning: 'fallback reasoning',
      key_phrases: ['fb1'],
      stances: {},
      prompt_version: 'v4.2.0',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(serverResponse),
    });

    const onStatus = vi.fn();
    const result = await inferenceModule.runAnalysis({
      article: { content_markdown: 'test content' },
      knowledgeEntries: [],
      mode: 'webgpu',
      onStatus,
    });

    // Should fallback to server
    expect(result.mode).toBe('server');
    expect(result.bias_score).toBe(55);

    // onStatus should include fallback_to_server stage
    const stages = onStatus.mock.calls.map(c => c[0]);
    expect(stages).toContain('fallback_to_server');
  });

  it('throws when both WebGPU and server fail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(
      inferenceModule.runAnalysis({
        article: { content_markdown: 'test' },
        mode: 'webgpu',
        onStatus: vi.fn(),
      })
    ).rejects.toThrow(/All inference modes failed/);
  });

  it('throws directly when server mode fails without fallback', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(
      inferenceModule.runAnalysis({
        article: { content_markdown: 'test' },
        mode: 'server',
        onStatus: vi.fn(),
      })
    ).rejects.toThrow(/Server inference failed/);
  });

  it('calls onStatus with "preparing" as first stage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        bias_score: 50,
        points: [],
        reasoning: '',
        key_phrases: [],
        stances: {},
      }),
    });

    const onStatus = vi.fn();
    await inferenceModule.runAnalysis({
      article: { content_markdown: 'test' },
      mode: 'server',
      onStatus,
    });

    expect(onStatus.mock.calls[0][0]).toBe('preparing');
  });
});

// ══════════════════════════════════════════════
// 6. clearAllModelCaches
// ══════════════════════════════════════════════

describe('clearAllModelCaches', () => {
  it('returns freed MB after clearing caches', async () => {
    // Mock the Cache API
    const mockBlob = { size: 1024 * 1024 * 100 }; // 100 MB
    const mockResponse = { blob: vi.fn().mockResolvedValue(mockBlob) };
    const mockCache = {
      keys: vi.fn().mockResolvedValue([new Request('https://example.com/model')]),
      match: vi.fn().mockResolvedValue(mockResponse),
    };

    globalThis.caches = {
      keys: vi.fn().mockResolvedValue(['webllm-cache-v1']),
      open: vi.fn().mockResolvedValue(mockCache),
      delete: vi.fn().mockResolvedValue(true),
    };

    const freedMB = await inferenceModule.clearAllModelCaches();

    expect(freedMB).toBe(100);
    expect(globalThis.caches.delete).toHaveBeenCalledWith('webllm-cache-v1');
  });

  it('returns 0 when no matching caches exist', async () => {
    globalThis.caches = {
      keys: vi.fn().mockResolvedValue(['some-other-cache']),
      open: vi.fn(),
      delete: vi.fn(),
    };

    const freedMB = await inferenceModule.clearAllModelCaches();

    expect(freedMB).toBe(0);
    expect(globalThis.caches.delete).not.toHaveBeenCalled();
  });

  it('handles cache API errors gracefully', async () => {
    globalThis.caches = {
      keys: vi.fn().mockRejectedValue(new Error('Cache API unavailable')),
    };

    const freedMB = await inferenceModule.clearAllModelCaches();

    expect(freedMB).toBe(0);
  });

  it('matches various model cache name patterns', async () => {
    const emptyCache = {
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn().mockResolvedValue(null),
    };

    globalThis.caches = {
      keys: vi.fn().mockResolvedValue([
        'webllm-models',
        'mlc-engine-v2',
        'Qwen3-cache',
        'DeepSeek-models',
        'Llama-weights',
        'wasm-runtime',
        'unrelated-cache',
      ]),
      open: vi.fn().mockResolvedValue(emptyCache),
      delete: vi.fn().mockResolvedValue(true),
    };

    await inferenceModule.clearAllModelCaches();

    // Should delete all model-related caches but not 'unrelated-cache'
    const deletedCaches = globalThis.caches.delete.mock.calls.map(c => c[0]);
    expect(deletedCaches).toContain('webllm-models');
    expect(deletedCaches).toContain('mlc-engine-v2');
    expect(deletedCaches).toContain('Qwen3-cache');
    expect(deletedCaches).toContain('DeepSeek-models');
    expect(deletedCaches).toContain('Llama-weights');
    expect(deletedCaches).toContain('wasm-runtime');
    expect(deletedCaches).not.toContain('unrelated-cache');
  });
});
