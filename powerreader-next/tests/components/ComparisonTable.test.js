/**
 * Tests for ComparisonTable component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// Mock SourceIcon dependency
vi.mock('$lib/components/article/SourceIcon.svelte', () => ({
  default: vi.fn(),
}));

import ComparisonTable from '../../src/lib/components/data-viz/ComparisonTable.svelte';

const makeArticle = (overrides = {}) => ({
  article_id: 'art-1',
  title: '測試標題',
  source: 'cna',
  bias_score: 55,
  primary_url: 'https://example.com/article',
  ...overrides,
});

describe('ComparisonTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when fewer than 2 sources', () => {
    const { container } = render(ComparisonTable, {
      props: {
        articlesBySource: [['cna', [makeArticle()]]],
      },
    });
    expect(container.querySelector('.comparison-table')).toBeNull();
  });

  it('renders table when 2+ sources present', () => {
    const { container } = render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle({ source: 'cna' })]],
          ['liberty_times', [makeArticle({ source: 'liberty_times', article_id: 'art-2', title: '自由標題' })]],
        ],
      },
    });
    expect(container.querySelector('.comparison-table')).toBeTruthy();
  });

  it('renders section heading with compare_arrows icon', () => {
    render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle()]],
          ['liberty_times', [makeArticle({ article_id: 'art-2' })]],
        ],
      },
    });
    expect(screen.getByText('跨媒體比較')).toBeTruthy();
    expect(screen.getByText('compare_arrows')).toBeTruthy();
  });

  it('renders source names', () => {
    render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle()]],
          ['liberty_times', [makeArticle({ article_id: 'art-2' })]],
        ],
      },
    });
    expect(screen.getByText('cna')).toBeTruthy();
    expect(screen.getByText('liberty_times')).toBeTruthy();
  });

  it('renders article count per source', () => {
    render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle(), makeArticle({ article_id: 'art-2', title: '另一篇' })]],
          ['liberty_times', [makeArticle({ article_id: 'art-3' })]],
        ],
      },
    });
    expect(screen.getByText('2 篇')).toBeTruthy();
    expect(screen.getByText('1 篇')).toBeTruthy();
  });

  it('renders bias score for analyzed articles', () => {
    render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle({ bias_score: 42 })]],
          ['liberty_times', [makeArticle({ article_id: 'art-2', bias_score: 78 })]],
        ],
      },
    });
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('78')).toBeTruthy();
  });

  it('renders "待分析" for articles without bias_score', () => {
    render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle({ bias_score: null })]],
          ['liberty_times', [makeArticle({ article_id: 'art-2', bias_score: null })]],
        ],
      },
    });
    const pending = screen.getAllByText('待分析');
    expect(pending.length).toBe(2);
  });

  it('renders article title', () => {
    render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle({ title: '國安會議新聞' })]],
          ['liberty_times', [makeArticle({ article_id: 'art-2', title: '自由時報報導' })]],
        ],
      },
    });
    expect(screen.getByText('國安會議新聞')).toBeTruthy();
    expect(screen.getByText('自由時報報導')).toBeTruthy();
  });

  it('renders external link for articles with primary_url', () => {
    const { container } = render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle({ primary_url: 'https://cna.com/1' })]],
          ['liberty_times', [makeArticle({ article_id: 'art-2', primary_url: 'https://ltn.com/1' })]],
        ],
      },
    });
    const links = container.querySelectorAll('.art-title-link');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('https://cna.com/1');
    expect(links[0].getAttribute('target')).toBe('_blank');
  });

  it('renders article title as plain text when no primary_url', () => {
    const { container } = render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle({ primary_url: null, title: '無連結標題' })]],
          ['liberty_times', [makeArticle({ article_id: 'art-2' })]],
        ],
      },
    });
    expect(screen.getByText('無連結標題')).toBeTruthy();
    // Should not be wrapped in a link
    const titleEl = screen.getByText('無連結標題');
    expect(titleEl.closest('a')).toBeNull();
  });

  it('applies zebra striping via odd class', () => {
    const { container } = render(ComparisonTable, {
      props: {
        articlesBySource: [
          ['cna', [makeArticle()]],
          ['liberty_times', [makeArticle({ article_id: 'art-2' })]],
          ['china_times', [makeArticle({ article_id: 'art-3' })]],
        ],
      },
    });
    const rows = container.querySelectorAll('.comparison-row');
    expect(rows.length).toBe(3);
    expect(rows[1].classList.contains('odd')).toBe(true);
    expect(rows[0].classList.contains('odd')).toBe(false);
  });
});
