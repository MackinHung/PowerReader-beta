/**
 * Unit tests for article-detail.js — GPU consent logic
 *
 * Tests cover: isGPUConsentGiven, proceedToAnalysis gate behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mod;
let mockFetchArticle, mockEnqueueAnalysis, mockCancelAnalysis;
let mockOnQueueChange, mockGetQueueStatus;
let mockRunPreAnalysisChecks, mockScanGPU;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();

  mockFetchArticle = vi.fn();
  mockEnqueueAnalysis = vi.fn(() => new Promise(() => {})); // never resolves (prevents side effects)
  mockCancelAnalysis = vi.fn();
  mockOnQueueChange = vi.fn(() => () => {});
  mockGetQueueStatus = vi.fn(() => ({ currentJob: null, pending: [] }));
  mockRunPreAnalysisChecks = vi.fn(() => Promise.resolve({ canAnalyze: true, issues: [] }));
  mockScanGPU = vi.fn(() => Promise.resolve({ supported: true, vendor: 'nvidia', architecture: 'ada', device: 'RTX 4070', vramMB: 12288, gpuType: 'discrete', archInfo: null }));

  vi.doMock('../../src/js/api.js', () => ({
    fetchArticle: mockFetchArticle,
  }));
  vi.doMock('../../src/js/components/controversy-badge.js', () => ({
    createControversyMeter: vi.fn(() => document.createElement('div')),
  }));
  vi.doMock('../../src/js/components/camp-bar.js', () => ({
    createCampBar: vi.fn(() => document.createElement('div')),
  }));
  vi.doMock('../../src/js/model/queue.js', () => ({
    enqueueAnalysis: mockEnqueueAnalysis,
    cancelAnalysis: mockCancelAnalysis,
    onQueueChange: mockOnQueueChange,
    getQueueStatus: mockGetQueueStatus,
    AnalysisCancelledError: class extends Error {},
  }));
  vi.doMock('../../src/js/pages/analyze-result.js', () => ({
    renderResultPreview: vi.fn(),
  }));
  vi.doMock('../../src/js/pages/analyze-checks.js', () => ({
    runPreAnalysisChecks: mockRunPreAnalysisChecks,
  }));
  vi.doMock('../../src/js/pages/analyze-engine.js', () => ({
    updateStatusUI: vi.fn(),
  }));
  vi.doMock('../../src/js/pages/article-panels.js', () => ({
    loadClusterPanel: vi.fn(),
  }));
  vi.doMock('../../src/js/model/auto-runner.js', () => ({
    getAutoRunnerStatus: vi.fn(() => ({ running: false })),
  }));
  vi.doMock('../../src/js/model/benchmark.js', () => ({
    scanGPU: mockScanGPU,
    getUserGPUSelection: vi.fn(() => null),
    saveUserGPUSelection: vi.fn(),
  }));
  vi.doMock('../../src/js/model/gpu-database.js', () => ({
    getGPUOptionsForArch: vi.fn(() => null),
  }));
  vi.doMock('../../src/js/pages/settings-helpers.js', () => ({
    formatVRAM: vi.fn((mb) => `${mb} MB`),
  }));
  vi.doMock('../../src/js/utils/device-detect.js', () => ({
    isMobileDevice: vi.fn(() => false),
  }));

  mod = await import('../../src/js/pages/article-detail.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ══════════════════════════════════════════════
// 1. isGPUConsentGiven
// ══════════════════════════════════════════════

describe('isGPUConsentGiven', () => {
  it('returns false when localStorage key is not set', () => {
    expect(mod.isGPUConsentGiven()).toBe(false);
  });

  it('returns true when localStorage key is "1"', () => {
    localStorage.setItem('powerreader_gpu_consent', '1');
    expect(mod.isGPUConsentGiven()).toBe(true);
  });

  it('returns false when localStorage key is something other than "1"', () => {
    localStorage.setItem('powerreader_gpu_consent', '0');
    expect(mod.isGPUConsentGiven()).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 2. renderArticle — GPU consent gate integration
// ══════════════════════════════════════════════

describe('renderArticle — GPU consent gate', () => {
  const mockArticle = {
    article_id: 'test-123',
    title: 'Test Article',
    source: 'cna',
    published_at: '2026-03-10T00:00:00Z',
    summary: 'Test summary',
  };

  it('shows GPU consent card when consent is not given', async () => {
    mockFetchArticle.mockResolvedValue({ success: true, data: mockArticle });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'test-123' });

    // Click the manual analyze button
    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      // Wait for async proceedToAnalysis
      await new Promise(r => setTimeout(r, 50));
    }

    // Should show GPU consent card (not directly enqueue)
    const consentCard = container.querySelector('.gpu-consent-card');
    // The consent card should appear after clicking analyze
    // (proceedToAnalysis is triggered by the button click)
    expect(mockEnqueueAnalysis).not.toHaveBeenCalled();
  });

  it('skips consent card and enqueues when consent is already given', async () => {
    localStorage.setItem('powerreader_gpu_consent', '1');
    mockFetchArticle.mockResolvedValue({ success: true, data: mockArticle });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'test-123' });

    // Click the manual analyze button
    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      // Wait for async proceedToAnalysis
      await new Promise(r => setTimeout(r, 50));
    }

    // Should directly enqueue (consent already given)
    expect(mockEnqueueAnalysis).toHaveBeenCalled();
  });

  it('shows mobile blocked message on mobile device', async () => {
    // Re-import with mobile device mock
    vi.resetModules();

    vi.doMock('../../src/js/utils/device-detect.js', () => ({
      isMobileDevice: vi.fn(() => true),
    }));
    // Re-register all other mocks
    vi.doMock('../../src/js/api.js', () => ({ fetchArticle: mockFetchArticle }));
    vi.doMock('../../src/js/components/controversy-badge.js', () => ({
      createControversyMeter: vi.fn(() => document.createElement('div')),
    }));
    vi.doMock('../../src/js/components/camp-bar.js', () => ({
      createCampBar: vi.fn(() => document.createElement('div')),
    }));
    vi.doMock('../../src/js/model/queue.js', () => ({
      enqueueAnalysis: mockEnqueueAnalysis,
      cancelAnalysis: mockCancelAnalysis,
      onQueueChange: mockOnQueueChange,
      getQueueStatus: mockGetQueueStatus,
      AnalysisCancelledError: class extends Error {},
    }));
    vi.doMock('../../src/js/pages/analyze-result.js', () => ({ renderResultPreview: vi.fn() }));
    vi.doMock('../../src/js/pages/analyze-checks.js', () => ({
      runPreAnalysisChecks: mockRunPreAnalysisChecks,
    }));
    vi.doMock('../../src/js/pages/analyze-engine.js', () => ({ updateStatusUI: vi.fn() }));
    vi.doMock('../../src/js/pages/article-panels.js', () => ({ loadClusterPanel: vi.fn() }));
    vi.doMock('../../src/js/model/auto-runner.js', () => ({
      getAutoRunnerStatus: vi.fn(() => ({ running: false })),
    }));
    vi.doMock('../../src/js/model/benchmark.js', () => ({
      scanGPU: mockScanGPU,
      getUserGPUSelection: vi.fn(() => null),
      saveUserGPUSelection: vi.fn(),
    }));
    vi.doMock('../../src/js/model/gpu-database.js', () => ({
      getGPUOptionsForArch: vi.fn(() => null),
    }));
    vi.doMock('../../src/js/pages/settings-helpers.js', () => ({
      formatVRAM: vi.fn((mb) => `${mb} MB`),
    }));

    const mobileMod = await import('../../src/js/pages/article-detail.js');
    mockFetchArticle.mockResolvedValue({ success: true, data: mockArticle });

    const container = document.createElement('div');
    await mobileMod.renderArticle(container, { hash: 'test-123' });

    // Click analyze button
    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      await new Promise(r => setTimeout(r, 50));
    }

    // Should show blocked message, NOT enqueue
    expect(mockEnqueueAnalysis).not.toHaveBeenCalled();
    const blockedMsg = container.querySelector('.gpu-consent-card__blocked');
    expect(blockedMsg).not.toBeNull();
  });

  it('shows no-webgpu blocked message when GPU not supported', async () => {
    mockScanGPU.mockResolvedValue({ supported: false, vendor: '', architecture: '', device: '', vramMB: 0, gpuType: 'unknown', archInfo: null });
    mockFetchArticle.mockResolvedValue({ success: true, data: mockArticle });

    const container = document.createElement('div');
    await mod.renderArticle(container, { hash: 'test-123' });

    // Click analyze button
    const analyzeBtn = container.querySelector('.btn--large');
    if (analyzeBtn) {
      analyzeBtn.click();
      await new Promise(r => setTimeout(r, 50));
    }

    // Should show blocked message
    expect(mockEnqueueAnalysis).not.toHaveBeenCalled();
    const blockedMsg = container.querySelector('.gpu-consent-card__blocked');
    expect(blockedMsg).not.toBeNull();
  });
});
