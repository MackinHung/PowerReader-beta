/**
 * Unit tests for groq.js (Groq API Inference)
 *
 * Tests cover: API key management, callGroq, runGroqAnalysis,
 *              error handling, dual-pass flow
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock prompt.js and output-parser.js ──
vi.mock('$lib/core/prompt.js', () => ({
  assembleScoreSystemPrompt: vi.fn(() => 'score system prompt'),
  assembleNarrativeSystemPrompt: vi.fn(() => 'narrative prompt'),
  assembleUserMessage: vi.fn(() => 'user message content')
}));

vi.mock('$lib/core/output-parser.js', () => ({
  parseScoreOutput: vi.fn((raw) => ({
    bias_score: 35,
    camp_ratio: { green: 40, white: 20, blue: 30, gray: 10 }
  })),
  parseNarrativeOutput: vi.fn((raw) => ({
    points: ['重點1', '重點2', '重點3'],
    key_phrases: ['關鍵詞1', '關鍵詞2'],
    stances: {}
  }))
}));

// ── Mock localStorage ──
const storage = {};
const mockLocalStorage = {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val; }),
  removeItem: vi.fn((key) => { delete storage[key]; })
};

// ── Mock fetch ──
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage);
  vi.stubGlobal('fetch', mockFetch);

  // Clear storage
  for (const key of Object.keys(storage)) delete storage[key];

  // Default successful fetch mock
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: '{"bias_score": 35}' } }]
    })
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Dynamic import ──
async function loadModule() {
  vi.resetModules();
  return await import('../../src/lib/core/groq.js');
}

// ══════════════════════════════════════════════
// 1. API Key Management
// ══════════════════════════════════════════════

describe('API Key Management', () => {
  it('getGroqApiKey returns null when not set', async () => {
    const { getGroqApiKey } = await loadModule();
    expect(getGroqApiKey()).toBeNull();
  });

  it('setGroqApiKey stores key in localStorage', async () => {
    const { setGroqApiKey, getGroqApiKey } = await loadModule();
    setGroqApiKey('gsk_test123');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('powerreader_groq_api_key', 'gsk_test123');
  });

  it('getGroqModel returns default when not set', async () => {
    const { getGroqModel } = await loadModule();
    expect(getGroqModel()).toBe('llama-3.1-8b-instant');
  });

  it('setGroqModel stores model in localStorage', async () => {
    const { setGroqModel } = await loadModule();
    setGroqModel('mixtral-8x7b-32768');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('powerreader_groq_model', 'mixtral-8x7b-32768');
  });

  it('isGroqConfigured returns false with no key', async () => {
    const { isGroqConfigured } = await loadModule();
    expect(isGroqConfigured()).toBe(false);
  });

  it('isGroqConfigured returns true with valid key', async () => {
    storage['powerreader_groq_api_key'] = 'gsk_abc123def456';
    const { isGroqConfigured } = await loadModule();
    expect(isGroqConfigured()).toBe(true);
  });

  it('isGroqConfigured returns false with short key', async () => {
    storage['powerreader_groq_api_key'] = 'short';
    const { isGroqConfigured } = await loadModule();
    expect(isGroqConfigured()).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 2. runGroqAnalysis
// ══════════════════════════════════════════════

describe('runGroqAnalysis', () => {
  const article = { title: 'Test Article', content_markdown: 'Content...' };

  it('throws when no API key is configured', async () => {
    const { runGroqAnalysis } = await loadModule();
    await expect(runGroqAnalysis(article)).rejects.toThrow('Groq API key not configured');
  });

  it('calls fetch twice for dual-pass', async () => {
    const { runGroqAnalysis } = await loadModule();
    await runGroqAnalysis(article, [], 'gsk_testkey123');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns expected result shape', async () => {
    const { runGroqAnalysis } = await loadModule();
    const result = await runGroqAnalysis(article, [], 'gsk_testkey123');

    expect(result.bias_score).toBe(35);
    expect(result.points).toEqual(['重點1', '重點2', '重點3']);
    expect(result.key_phrases).toEqual(['關鍵詞1', '關鍵詞2']);
    expect(result.stances).toEqual({});
    expect(result.mode).toBe('groq');
    expect(typeof result.latency_ms).toBe('number');
    expect(result.prompt_version).toBe('v4.2.0');
  });

  it('uses provided apiKey and model', async () => {
    const { runGroqAnalysis } = await loadModule();
    await runGroqAnalysis(article, [], 'gsk_custom_key', 'mixtral-8x7b-32768');

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[1].headers['Authorization']).toBe('Bearer gsk_custom_key');
    const body = JSON.parse(firstCall[1].body);
    expect(body.model).toBe('mixtral-8x7b-32768');
  });

  it('falls back to stored key and model', async () => {
    storage['powerreader_groq_api_key'] = 'gsk_stored_key';
    storage['powerreader_groq_model'] = 'gemma2-9b-it';

    const { runGroqAnalysis } = await loadModule();
    await runGroqAnalysis(article);

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[1].headers['Authorization']).toBe('Bearer gsk_stored_key');
    const body = JSON.parse(firstCall[1].body);
    expect(body.model).toBe('gemma2-9b-it');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    });

    const { runGroqAnalysis } = await loadModule();
    await expect(runGroqAnalysis(article, [], 'gsk_bad_key'))
      .rejects.toThrow('Groq API 401');
  });

  it('passes correct prompts to API', async () => {
    const { runGroqAnalysis } = await loadModule();
    const { assembleScoreSystemPrompt, assembleNarrativeSystemPrompt } = await import('$lib/core/prompt.js');

    await runGroqAnalysis(article, [], 'gsk_testkey123');

    // Pass 1 should use score system prompt
    const pass1Body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(pass1Body.messages[0].content).toBe('score system prompt');

    // Pass 2 should use narrative prompt (no score parameters)
    const pass2Body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(pass2Body.messages[0].content).toBe('narrative prompt');
  });

  it('has _debug field with raw responses', async () => {
    const { runGroqAnalysis } = await loadModule();
    const result = await runGroqAnalysis(article, [], 'gsk_testkey123');

    expect(result._debug).toBeDefined();
    expect(result._debug.model).toBe('llama-3.1-8b-instant');
    expect(typeof result._debug.pass1_raw).toBe('string');
    expect(typeof result._debug.pass2_raw).toBe('string');
  });
});
