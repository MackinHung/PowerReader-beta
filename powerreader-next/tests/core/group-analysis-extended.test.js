/**
 * Extended tests for group-analysis.js
 *
 * Covers: runGroupAnalysis (pipeline), storeGroupAnalysis (IDB),
 *         getGroupAnalysis (IDB), edge cases in existing functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock IDB helpers ──

const mockStore = {
  _data: {},
  put(item) {
    const key = item.cluster_id;
    mockStore._data[key] = item;
    return { onsuccess: null, onerror: null };
  },
  get(key) {
    const req = {
      result: mockStore._data[key] || undefined,
      onsuccess: null,
      onerror: null,
    };
    Promise.resolve().then(() => req.onsuccess?.());
    return req;
  },
};

const mockTx = {
  objectStore() { return mockStore; },
  oncomplete: null,
  onerror: null,
  error: null,
};

const mockDB = {
  transaction(storeName, mode) {
    const tx = { ...mockTx, oncomplete: null, onerror: null };
    Promise.resolve().then(() => tx.oncomplete?.());
    return tx;
  },
  close: vi.fn(),
};

vi.mock('../../src/lib/core/db.js', () => ({
  openDB: vi.fn(() => Promise.resolve(mockDB)),
}));

vi.mock('$lib/utils/idb-helpers.js', () => ({
  promisifyRequest: vi.fn((req) => {
    return new Promise((resolve, reject) => {
      if (req.result !== undefined) resolve(req.result);
      const origOnsuccess = req.onsuccess;
      req.onsuccess = () => {
        resolve(req.result);
        origOnsuccess?.();
      };
      req.onerror = () => reject(req.error);
    });
  }),
  promisifyTransaction: vi.fn((tx) => {
    return new Promise((resolve, reject) => {
      const origComplete = tx.oncomplete;
      tx.oncomplete = () => {
        resolve();
        origComplete?.();
      };
      tx.onerror = () => reject(tx.error);
    });
  }),
}));

// ── Dynamic module import ──

let groupModule;

async function loadModule() {
  return await import('../../src/lib/core/group-analysis.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();
  mockStore._data = {};
  mockDB.close.mockReset();

  vi.mock('../../src/lib/core/db.js', () => ({
    openDB: vi.fn(() => Promise.resolve(mockDB)),
  }));
  vi.mock('$lib/utils/idb-helpers.js', () => ({
    promisifyRequest: vi.fn((req) => {
      return new Promise((resolve) => {
        if (req.result !== undefined) resolve(req.result);
        else {
          const origOnsuccess = req.onsuccess;
          req.onsuccess = () => {
            resolve(req.result);
            origOnsuccess?.();
          };
        }
      });
    }),
    promisifyTransaction: vi.fn((tx) => {
      return new Promise((resolve) => {
        const origComplete = tx.oncomplete;
        tx.oncomplete = () => {
          resolve();
          origComplete?.();
        };
      });
    }),
  }));

  groupModule = await loadModule();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ──

function makeArticle(id, source) {
  return {
    article_id: id,
    title: `Article ${id}`,
    source,
    summary: '',
    content_markdown: '',
    primary_url: '',
    published_at: '',
  };
}

function makeAnalysis(overrides = {}) {
  return {
    bias_score: 50,
    camp_ratio: { green: 20, white: 20, blue: 20, gray: 40 },
    is_political: true,
    emotion_intensity: 50,
    points: ['p1'],
    key_phrases: ['k1'],
    reasoning: '',
    prompt_version: 'v4.0.0',
    mode: 'webgpu',
    latency_ms: 0,
    ...overrides,
  };
}

// ══════════════════════════════════════════════
// runGroupAnalysis
// ══════════════════════════════════════════════

describe('runGroupAnalysis', () => {
  it('runs full pipeline and returns GroupAnalysisResult', async () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src2'),
      makeArticle('a3', 'src3'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis({ bias_score: 30, camp_ratio: { green: 60, white: 10, blue: 10, gray: 20 } })],
      ['a2', makeAnalysis({ bias_score: 70, camp_ratio: { green: 10, white: 10, blue: 60, gray: 20 } })],
      ['a3', makeAnalysis({ bias_score: 50, camp_ratio: { green: 10, white: 50, blue: 10, gray: 30 } })],
    ]);

    const mockRunInference = vi.fn().mockResolvedValue(JSON.stringify({
      source_summaries: [
        { source: 'src1', camp: 'green', summary: 'Summary 1' },
        { source: 'src2', camp: 'blue', summary: 'Summary 2' },
        { source: 'src3', camp: 'white', summary: 'Summary 3' },
      ],
      group_summary: 'Overall balanced coverage',
      bias_direction: '多元',
    }));

    const result = await groupModule.runGroupAnalysis('cluster-1', articles, analyses, mockRunInference);

    expect(result.cluster_id).toBe('cluster-1');
    expect(result.total_articles).toBe(3);
    expect(result.total_sources).toBe(3);
    expect(result.group_summary).toBe('Overall balanced coverage');
    expect(result.bias_direction).toBe('多元');
    expect(result.source_breakdowns).toHaveLength(3);
    expect(result.camp_statistics).toBeDefined();
    expect(result.prompt_version).toBe('v4.0.0');
    expect(result.analyzed_at).toBeDefined();
  });

  it('calls runInference with correct prompts', async () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src2'),
      makeArticle('a3', 'src3'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
      ['a3', makeAnalysis()],
    ]);

    const mockRunInference = vi.fn().mockResolvedValue(JSON.stringify({
      source_summaries: [],
      group_summary: '',
      bias_direction: '多元',
    }));

    await groupModule.runGroupAnalysis('c1', articles, analyses, mockRunInference);

    expect(mockRunInference).toHaveBeenCalledTimes(1);
    const [systemPrompt, userMessage] = mockRunInference.mock.calls[0];
    expect(systemPrompt).toContain('跨媒體');
    expect(() => JSON.parse(userMessage)).not.toThrow();
  });

  it('skips unanalyzed articles', async () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src2'),
      makeArticle('a3', 'src3'),
      makeArticle('a4', 'src4'), // not analyzed
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
      ['a3', makeAnalysis()],
    ]);

    const mockRunInference = vi.fn().mockResolvedValue(JSON.stringify({
      source_summaries: [],
      group_summary: '',
      bias_direction: '多元',
    }));

    const result = await groupModule.runGroupAnalysis('c1', articles, analyses, mockRunInference);

    expect(result.total_articles).toBe(3); // excludes a4
    expect(result.total_sources).toBe(3);
  });

  it('deduplicates sources (takes first article per source)', async () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src1'), // same source
      makeArticle('a3', 'src2'),
      makeArticle('a4', 'src3'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis({ bias_score: 30 })],
      ['a2', makeAnalysis({ bias_score: 70 })],
      ['a3', makeAnalysis()],
      ['a4', makeAnalysis()],
    ]);

    const mockRunInference = vi.fn().mockResolvedValue(JSON.stringify({
      source_summaries: [],
      group_summary: '',
      bias_direction: '多元',
    }));

    const result = await groupModule.runGroupAnalysis('c1', articles, analyses, mockRunInference);

    expect(result.total_sources).toBe(3); // src1 counted once
    expect(result.source_breakdowns).toHaveLength(3);
  });

  it('stores result in IDB', async () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src2'),
      makeArticle('a3', 'src3'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
      ['a3', makeAnalysis()],
    ]);

    const mockRunInference = vi.fn().mockResolvedValue(JSON.stringify({
      source_summaries: [],
      group_summary: 'test',
      bias_direction: '多元',
    }));

    await groupModule.runGroupAnalysis('store-test', articles, analyses, mockRunInference);

    // Verify IDB store was called
    expect(mockStore._data['store-test']).toBeDefined();
    expect(mockStore._data['store-test'].cluster_id).toBe('store-test');
  });
});

// ══════════════════════════════════════════════
// storeGroupAnalysis
// ══════════════════════════════════════════════

describe('storeGroupAnalysis', () => {
  it('stores result in IDB', async () => {
    const result = {
      cluster_id: 'c-store',
      analyzed_at: new Date().toISOString(),
      source_breakdowns: [],
      camp_statistics: [],
      group_summary: 'Test',
      bias_direction: '多元',
      total_articles: 3,
      total_sources: 3,
      prompt_version: 'v4.0.0',
    };

    await groupModule.storeGroupAnalysis(result);

    expect(mockStore._data['c-store']).toBeDefined();
    expect(mockStore._data['c-store'].group_summary).toBe('Test');
  });

  it('does not throw on IDB error', async () => {
    // Override openDB to throw
    const dbMock = await import('../../src/lib/core/db.js');
    dbMock.openDB.mockRejectedValueOnce(new Error('IDB unavailable'));

    await expect(
      groupModule.storeGroupAnalysis({ cluster_id: 'fail' })
    ).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════
// getGroupAnalysis
// ══════════════════════════════════════════════

describe('getGroupAnalysis', () => {
  it('returns stored result by clusterId', async () => {
    mockStore._data['c-get'] = {
      cluster_id: 'c-get',
      group_summary: 'Retrieved',
      bias_direction: '偏綠',
    };

    const result = await groupModule.getGroupAnalysis('c-get');

    expect(result).not.toBeNull();
    expect(result.cluster_id).toBe('c-get');
    expect(result.group_summary).toBe('Retrieved');
  });

  it('returns null when clusterId not found', async () => {
    const result = await groupModule.getGroupAnalysis('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null on IDB error', async () => {
    const dbMock = await import('../../src/lib/core/db.js');
    dbMock.openDB.mockRejectedValueOnce(new Error('IDB down'));

    const result = await groupModule.getGroupAnalysis('fail');
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════
// Edge cases for existing functions
// ══════════════════════════════════════════════

describe('computeCampStatistics — edge cases', () => {
  it('handles articles with missing camp_ratio in analysis', () => {
    const articles = [makeArticle('a1', 'src1')];
    const analyses = new Map([
      ['a1', makeAnalysis({ camp_ratio: null })],
    ]);

    const result = groupModule.computeCampStatistics(articles, analyses);
    // getDominantCamp(null) returns 'gray'
    expect(result[0].camp).toBe('gray');
  });

  it('handles large number of articles', () => {
    const articles = [];
    const analyses = new Map();
    for (let i = 0; i < 100; i++) {
      const id = `a${i}`;
      const source = `src${i % 10}`;
      articles.push(makeArticle(id, source));
      analyses.set(id, makeAnalysis({
        bias_score: i,
        camp_ratio: { green: i % 4 === 0 ? 60 : 10, white: i % 4 === 1 ? 60 : 10, blue: i % 4 === 2 ? 60 : 10, gray: i % 4 === 3 ? 60 : 10 },
      }));
    }

    const result = groupModule.computeCampStatistics(articles, analyses);
    expect(result.length).toBeGreaterThan(0);
    const totalArticles = result.reduce((sum, s) => sum + s.article_count, 0);
    expect(totalArticles).toBe(100);
  });
});

describe('parseGroupOutput — additional edge cases', () => {
  it('handles deeply nested JSON', () => {
    const raw = JSON.stringify({
      source_summaries: [
        { source: 's1', camp: 'green', summary: 'test', extra: { nested: true } },
      ],
      group_summary: 'test',
      bias_direction: '偏藍',
      extra_field: 'ignored',
    });
    const result = groupModule.parseGroupOutput(raw);
    expect(result.source_summaries[0].source).toBe('s1');
    expect(result.bias_direction).toBe('偏藍');
  });

  it('handles number as group_summary', () => {
    const raw = JSON.stringify({
      source_summaries: [],
      group_summary: 42,
      bias_direction: '中立',
    });
    const result = groupModule.parseGroupOutput(raw);
    expect(result.group_summary).toBe('');
  });
});
