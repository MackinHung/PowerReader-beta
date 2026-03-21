/**
 * Extended tests for GroupReport.svelte
 *
 * Supplements existing coverage to boost from ~70.5% to 80%+.
 * Focuses on: null report, direction badge colors, camp statistics,
 * source breakdowns with summaries, group summary.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import GroupReport from '$lib/components/data-viz/GroupReport.svelte';

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'group.bias_direction': '整體偏向',
      'group.source_breakdown': '來源分析',
      'group.camp_stats': '陣營統計',
      'group.summary': '綜合摘要',
    };
    return map[key] || key;
  })
}));

// Mock sources module (used by SourceIcon child component)
vi.mock('$lib/core/sources.js', () => ({
  getSourceInfo: vi.fn((source) => ({
    name: source,
    icon: source.charAt(0),
    color: '#999',
  })),
}));

describe('GroupReport – extended', () => {
  const fullReport = {
    bias_direction: '偏綠',
    total_articles: 8,
    total_sources: 4,
    source_breakdowns: [
      { source: '自由時報', camp: 'green', bias_score: -2, summary: '支持執政黨立場' },
      { source: '聯合報', camp: 'blue', bias_score: 1.5, summary: null },
      { source: '中央社', camp: 'white', bias_score: 0, summary: '客觀報導' },
    ],
    camp_statistics: [
      { camp: 'green', article_count: 4, avg_bias_score: -1.8, avg_emotion_intensity: 60 },
      { camp: 'blue', article_count: 2, avg_bias_score: 1.5, avg_emotion_intensity: 45 },
      { camp: 'white', article_count: 2, avg_bias_score: 0.2, avg_emotion_intensity: 30 },
    ],
    group_summary: '整體報導偏向泛綠陣營，綠營媒體數量佔多數。',
  };

  // ── Null report ──

  it('renders nothing when report is null', () => {
    const { container } = render(GroupReport, { props: { report: null } });
    expect(container.querySelector('.group-report')).toBeNull();
  });

  // ── Direction badge ──

  it('renders direction badge with report', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('偏綠')).toBeTruthy();
  });

  it('renders article and source count meta', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('8 篇 · 4 家媒體')).toBeTruthy();
  });

  it('applies direction color to badge', () => {
    const { container } = render(GroupReport, { props: { report: fullReport } });
    const badge = container.querySelector('.direction-badge');
    expect(badge.style.color).toContain('rgb');
  });

  it('renders 偏藍 direction correctly', () => {
    const blueReport = { ...fullReport, bias_direction: '偏藍' };
    render(GroupReport, { props: { report: blueReport } });
    expect(screen.getByText('偏藍')).toBeTruthy();
  });

  it('renders 中立 direction correctly', () => {
    const neutralReport = { ...fullReport, bias_direction: '中立' };
    render(GroupReport, { props: { report: neutralReport } });
    const badges = screen.getAllByText('中立');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders 多元 direction correctly', () => {
    const diverseReport = { ...fullReport, bias_direction: '多元' };
    render(GroupReport, { props: { report: diverseReport } });
    expect(screen.getByText('多元')).toBeTruthy();
  });

  // ── Source breakdowns ──

  it('renders all source rows', () => {
    const { container } = render(GroupReport, { props: { report: fullReport } });
    const rows = container.querySelectorAll('.source-row');
    expect(rows.length).toBe(3);
  });

  it('renders source names', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('自由時報')).toBeTruthy();
    expect(screen.getByText('聯合報')).toBeTruthy();
    expect(screen.getByText('中央社')).toBeTruthy();
  });

  it('renders camp labels for sources', () => {
    render(GroupReport, { props: { report: fullReport } });
    // Camp labels appear in both source breakdowns and camp statistics
    expect(screen.getAllByText('泛綠').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('泛藍').length).toBeGreaterThanOrEqual(1);
  });

  it('renders camp dot with correct background color', () => {
    const { container } = render(GroupReport, { props: { report: fullReport } });
    const dots = container.querySelectorAll('.camp-dot');
    expect(dots.length).toBe(3);
    expect(dots[0].style.background).toContain('rgb'); // green camp
  });

  it('renders source summary when present', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('支持執政黨立場')).toBeTruthy();
    expect(screen.getByText('客觀報導')).toBeTruthy();
  });

  it('does not render summary paragraph when summary is null', () => {
    const { container } = render(GroupReport, { props: { report: fullReport } });
    const summaries = container.querySelectorAll('.source-summary');
    // Only 2 out of 3 have summaries
    expect(summaries.length).toBe(2);
  });

  it('renders bias scores', () => {
    const { container } = render(GroupReport, { props: { report: fullReport } });
    const biasScores = container.querySelectorAll('.source-bias');
    expect(biasScores.length).toBe(3);
    expect(biasScores[0].textContent).toBe('-2');
  });

  // ── Camp statistics ──

  it('renders camp statistics section', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('陣營統計')).toBeTruthy();
  });

  it('renders camp stat cards', () => {
    const { container } = render(GroupReport, { props: { report: fullReport } });
    const cards = container.querySelectorAll('.camp-stat-card');
    expect(cards.length).toBe(3);
  });

  it('shows article count per camp', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('4 篇')).toBeTruthy();
    expect(screen.getAllByText('2 篇').length).toBe(2);
  });

  it('shows avg bias score in metrics', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('偏向: -1.8')).toBeTruthy();
    expect(screen.getByText('偏向: 1.5')).toBeTruthy();
  });

  it('hides camp statistics when empty', () => {
    const report = { ...fullReport, camp_statistics: [] };
    render(GroupReport, { props: { report } });
    expect(screen.queryByText('陣營統計')).toBeNull();
  });

  // ── Group summary ──

  it('renders group summary text', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('綜合摘要')).toBeTruthy();
    expect(screen.getByText('整體報導偏向泛綠陣營，綠營媒體數量佔多數。')).toBeTruthy();
  });

  it('hides group summary when falsy', () => {
    const report = { ...fullReport, group_summary: '' };
    render(GroupReport, { props: { report } });
    expect(screen.queryByText('綜合摘要')).toBeNull();
  });

  // ── Section labels ──

  it('renders source breakdown section label', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('來源分析')).toBeTruthy();
  });

  it('renders bias direction label', () => {
    render(GroupReport, { props: { report: fullReport } });
    expect(screen.getByText('整體偏向')).toBeTruthy();
  });
});
