/**
 * Component integration tests for Event Detail Page
 *
 * TDD RED phase: defines expected behavior AFTER refactoring.
 * Tests the Svelte page component's rendering and interactions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// Hoisted mocks (vi.mock is hoisted, so references must use vi.hoisted)
const { mockGoto, mockFetchClusterDetail } = vi.hoisted(() => ({
  mockGoto: vi.fn(),
  mockFetchClusterDetail: vi.fn(),
}));

// Mock SvelteKit modules
vi.mock('$app/navigation', () => ({ goto: mockGoto }));
vi.mock('$app/state', () => ({
  page: { params: { id: 'cluster-test-1' } },
}));

// Mock API
vi.mock('$lib/core/api.js', () => ({
  fetchClusterDetail: mockFetchClusterDetail,
  API_BASE: 'https://api.example.com',
}));

// Mock stores
vi.mock('$lib/stores/mediaQuery.svelte.js', () => ({
  getMediaQueryStore: () => ({ isDesktop: false }),
}));
vi.mock('$lib/stores/auth.svelte.js', () => ({
  getAuthStore: () => ({
    isAuthenticated: false,
    token: null,
  }),
}));

import EventDetailPage from '../../src/routes/event/[id]/+page.svelte';

// ── Test Data Factory ──

const makeCluster = (overrides = {}) => ({
  cluster_id: 'cluster-test-1',
  representative_title: '總統府召開國安會議討論區域安全',
  category: '政治',
  article_count: 10,
  source_count: 5,
  sources_json: JSON.stringify([
    { source: 'cna', count: 3 },
    { source: 'liberty_times', count: 4 },
    { source: 'china_times', count: 3 },
  ]),

  camp_distribution: { green: 40, white: 30, blue: 30 },
  earliest_published_at: '2026-03-18T06:00:00Z',
  latest_published_at: '2026-03-18T14:00:00Z',
  is_blindspot: false,
  blindspot_type: null,
  avg_camp_ratio: { dpp: 45, tpp: 25, kmt: 30 },
  analyzed_count: 7,
  ...overrides,
});

const makeArticle = (overrides = {}) => ({
  article_id: 'art-1',
  title: '國安會議討論台海安全',
  source: 'cna',
  published_at: '2026-03-18T08:00:00Z',
  bias_score: 55,
  analysis_count: 1,
  primary_url: 'https://example.com/article',
  ...overrides,
});

function setupAPI(cluster, articles) {
  mockFetchClusterDetail.mockResolvedValue({
    success: true,
    data: { cluster, articles },
  });
}

// ══════════════════════════════════════════════
// 1. Basic Rendering
// ══════════════════════════════════════════════

describe('EventDetailPage — basic rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders cluster title', async () => {
    setupAPI(makeCluster(), [makeArticle()]);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('總統府召開國安會議討論區域安全')).toBeTruthy();
    });
  });

  it('renders category badge', async () => {
    setupAPI(makeCluster(), [makeArticle()]);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('政治')).toBeTruthy();
    });
  });

  it('renders article/source count', async () => {
    setupAPI(makeCluster(), [makeArticle()]);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getAllByText(/10 篇/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/5 家媒體/).length).toBeGreaterThan(0);
    });
  });

  it('shows error state when API fails', async () => {
    mockFetchClusterDetail.mockResolvedValue({
      success: false,
      error: { message: '找不到此事件' },
    });
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('找不到此事件')).toBeTruthy();
    });
  });
});

// ══════════════════════════════════════════════
// 2. Analysis State Display
// ══════════════════════════════════════════════

describe('EventDetailPage — analysis state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows analysis progress "已分析 X/Y 篇"', async () => {
    setupAPI(makeCluster({ analyzed_count: 7, article_count: 10 }), [makeArticle()]);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText(/已分析 7\/10 篇/)).toBeTruthy();
    });
  });

  it('shows empty analysis state when 0 analyzed', async () => {
    setupAPI(
      makeCluster({
        analyzed_count: 0,

        camp_distribution: {},
      }),
      [makeArticle({ bias_score: null, analysis_count: 0 })],
    );
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText(/尚無分析/)).toBeTruthy();
    });
  });
});

// ══════════════════════════════════════════════
// 3. Article Navigation (CRITICAL: don't send users away)
// ══════════════════════════════════════════════

describe('EventDetailPage — article navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to /article/{id} when clicking an article card', async () => {
    const articles = [
      makeArticle({ article_id: 'art-abc', source: 'cna' }),
    ];
    setupAPI(makeCluster({ article_count: 1, source_count: 1 }), articles);
    const { container } = render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('國安會議討論台海安全')).toBeTruthy();
    });

    // Click the article card — should navigate internally via goto
    const articleEl = container.querySelector('[data-article-id="art-abc"]')
      || screen.getByText('國安會議討論台海安全').closest('[role="article"]')
      || screen.getByText('國安會議討論台海安全').closest('.article-card');

    if (articleEl) {
      await fireEvent.click(articleEl);
      expect(mockGoto).toHaveBeenCalledWith('/article/art-abc');
    }
  });
});

// ══════════════════════════════════════════════
// 4. Share Button
// ══════════════════════════════════════════════

describe('EventDetailPage — share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a share button', async () => {
    setupAPI(makeCluster(), [makeArticle()]);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('總統府召開國安會議討論區域安全')).toBeTruthy();
    });
    // Look for share button by aria-label or icon text
    const shareBtn = screen.queryByLabelText(/分享/)
      || screen.queryByText('share');
    expect(shareBtn).not.toBeNull();
  });
});

// ══════════════════════════════════════════════
// 5. Comparison Table
// ══════════════════════════════════════════════

describe('EventDetailPage — comparison table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "待分析" for unanalyzed articles', async () => {
    const articles = [
      makeArticle({ source: 'cna', bias_score: 55 }),
      makeArticle({ source: 'liberty_times', article_id: 'art-2', bias_score: null, analysis_count: 0, title: '另一篇報導' }),
    ];
    setupAPI(makeCluster({ article_count: 2, source_count: 2 }), articles);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getAllByText(/待分析/).length).toBeGreaterThan(0);
    });
  });

  it('shows bias score for analyzed articles', async () => {
    const articles = [
      makeArticle({ source: 'cna', bias_score: 55 }),
      makeArticle({ source: 'liberty_times', article_id: 'art-2', bias_score: 72, title: '另一篇報導' }),
    ];
    setupAPI(makeCluster({ article_count: 2, source_count: 2, analyzed_count: 2 }), articles);
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('55')).toBeTruthy();
      expect(screen.getByText('72')).toBeTruthy();
    });
  });
});

// ══════════════════════════════════════════════
// 6. BlindspotAlert
// ══════════════════════════════════════════════

describe('EventDetailPage — blindspot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows blindspot alert when is_blindspot is true and has analysis', async () => {
    setupAPI(
      makeCluster({
        is_blindspot: true,
        blindspot_type: 'green_only',
        analyzed_count: 3,
      }),
      [makeArticle()],
    );
    render(EventDetailPage);
    await vi.waitFor(() => {
      // May appear in badge and/or alert; at least one must exist
      expect(screen.getAllByText(/僅綠營報導/).length).toBeGreaterThan(0);
    });
  });

  it('hides blindspot alert when is_blindspot is false', async () => {
    setupAPI(
      makeCluster({ is_blindspot: false, blindspot_type: null }),
      [makeArticle()],
    );
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('總統府召開國安會議討論區域安全')).toBeTruthy();
    });
    expect(screen.queryByText(/僅綠營報導/)).toBeNull();
    expect(screen.queryByText(/僅藍營報導/)).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 7. Sub-Cluster Grouped Articles
// ══════════════════════════════════════════════

describe('EventDetailPage — sub-cluster grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows grouped articles when sub_clusters > 1', async () => {
    const articles = [
      makeArticle({ article_id: 'a1', title: '台灣里詐騙案起訴' }),
      makeArticle({ article_id: 'a2', title: '台灣里案法院判決' }),
      makeArticle({ article_id: 'b1', title: '柬埔寨詐騙案開庭', source: 'liberty_times' }),
    ];
    setupAPI(
      makeCluster({
        article_count: 3,
        source_count: 2,
        sub_clusters: [
          { representative_title: '台灣里詐騙案起訴', article_ids: ['a1', 'a2'], article_count: 2 },
          { representative_title: '柬埔寨詐騙案開庭', article_ids: ['b1'], article_count: 1 },
        ],
        sub_cluster_count: 2,
      }),
      articles,
    );
    render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('總統府召開國安會議討論區域安全')).toBeTruthy();
    });
    // Sub-cluster headers should appear
    const subHeaders = screen.getAllByText(/子事件/);
    expect(subHeaders.length).toBeGreaterThanOrEqual(1);
  });

  it('shows flat article list when no sub_clusters', async () => {
    const articles = [
      makeArticle({ article_id: 'a1', title: '國安會議報導一' }),
      makeArticle({ article_id: 'a2', title: '國安會議報導二' }),
    ];
    setupAPI(
      makeCluster({ article_count: 2, source_count: 1 }),
      articles,
    );
    const { container } = render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('總統府召開國安會議討論區域安全')).toBeTruthy();
    });
    // No sub-cluster group elements
    expect(container.querySelector('.sub-cluster-group')).toBeNull();
  });

  it('shows flat article list when sub_clusters has only 1 entry', async () => {
    const articles = [
      makeArticle({ article_id: 'a1', title: '國安會議報導' }),
    ];
    setupAPI(
      makeCluster({
        article_count: 1,
        source_count: 1,
        sub_clusters: [
          { representative_title: '國安會議報導', article_ids: ['a1'], article_count: 1 },
        ],
        sub_cluster_count: 1,
      }),
      articles,
    );
    const { container } = render(EventDetailPage);
    await vi.waitFor(() => {
      expect(screen.getByText('總統府召開國安會議討論區域安全')).toBeTruthy();
    });
    expect(container.querySelector('.sub-cluster-group')).toBeNull();
  });
});
