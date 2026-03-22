/**
 * Tests for Power Pool page — Sponsor flow UI
 *
 * Covers:
 * - Amount button rendering + selection highlight
 * - Custom amount input
 * - Type card rendering + selection
 * - Stats display
 * - Pay button visibility
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

// ── Mock dependencies BEFORE importing page ──

// Mock api.js
const mockCreateSponsorOrder = vi.fn().mockResolvedValue({
  success: true,
  data: {
    form_params: { MerchantID: '3002607', CheckMacValue: 'TESTMAC' },
    action_url: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  },
  error: null,
});

const mockFetchSponsorStats = vi.fn().mockResolvedValue({
  success: true,
  data: {
    total_amount: 1200,
    total_count: 8,
    by_type: {
      coffee: { count: 3, amount: 300 },
      civic: { count: 2, amount: 400 },
      compute: { count: 2, amount: 400 },
      proxy: { count: 1, amount: 100 },
    },
    pools: { developer: 300, platform: 600, compute: 300 },
  },
  error: null,
});

vi.mock('$lib/core/api.js', () => ({
  createSponsorOrder: (...args) => mockCreateSponsorOrder(...args),
  fetchSponsorStats: (...args) => mockFetchSponsorStats(...args),
  fetchMySponsorships: vi.fn().mockResolvedValue({
    success: true,
    data: { sponsorships: [] },
    error: null,
  }),
}));

vi.mock('$lib/stores/auth.svelte.js', () => ({
  getAuthStore: () => ({
    get token() { return null; },
    get isAuthenticated() { return false; },
  }),
}));

vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: (key) => {
    const msgs = {
      'power_pool.title': '動力池',
      'power_pool.subtitle': '正向飛輪',
      'power_pool.flywheel.title': '飛輪願景',
      'power_pool.flywheel.step1': '貢獻算力',
      'power_pool.flywheel.step2': '賺取點數',
      'power_pool.flywheel.step3': '全網共享分析',
      'power_pool.flywheel.step4': '更多人知道',
      'power_pool.flywheel.step5': '更多人參與',
      'power_pool.sponsor.desc': '透過贊助支持平台',
      'sponsor.title': '贊助與訂閱',
      'sponsor.step1_title': '選擇金額',
      'sponsor.step2_title': '選擇贊助類型',
      'sponsor.amount_custom': '自訂金額',
      'sponsor.amount_min': '最低 $30',
      'sponsor.type_coffee': '請杯咖啡',
      'sponsor.type_coffee_desc': '100% 開發者',
      'sponsor.type_civic': '公民力量',
      'sponsor.type_civic_desc': '80% 平台基金',
      'sponsor.type_compute': '算力推動',
      'sponsor.type_compute_desc': '50% 代理運算',
      'sponsor.type_proxy': '代理媒體',
      'sponsor.type_proxy_desc': '80% 代理運算',
      'sponsor.pay_button': '前往付款',
      'sponsor.paying': '處理中...',
      'sponsor.stats_title': '贊助透明統計',
      'sponsor.pool_developer': '開發者',
      'sponsor.pool_platform': '平台基金',
      'sponsor.pool_compute': '代理運算',
      'sponsor.total_amount': '總贊助金額',
      'sponsor.total_count': '贊助筆數',
      'sponsor.no_stats': '尚無贊助紀錄',
      'sponsor.error': '訂單建立失敗',
      'common.label.loading': '載入中...',
      'power_pool.transparency.title': '貢獻機制',
      'power_pool.transparency.subtitle': '你的每一次運算都在推動飛輪前進',
      'power_pool.transparency.platform_fund_title': '平台基金',
      'power_pool.transparency.platform_fund_desc': '用於建構點數商店與回饋機制',
      'power_pool.transparency.proxy_compute_title': '代理運算',
      'power_pool.transparency.proxy_compute_desc': '由伺服器驅動 AI 模型',
      'power_pool.transparency.reward_title': '回饋機制',
      'power_pool.transparency.reward_badge': '未開放',
      'power_pool.transparency.reward_desc': '每月設有綜合獎金池',
      'power_pool.report.title': '群體分析報告',
      'power_pool.report.desc': '自動生成報告',
      'power_pool.report.mock_label': '範例預覽',
      'power_pool.report.mock_direction': '多元',
      'power_pool.report.mock_topic': '勞基法修法爭議',
      'power_pool.report.mock_meta': '5 篇 · 4 家媒體',
      'power_pool.report.mock_summary': '此議題呈現多元觀點。',
    };
    return msgs[key] || key;
  },
}));

// Polyfill for jsdom
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { cancel: () => {}, finished: Promise.resolve() };
  };
}

// ── Tests ──

import PowerPoolPage from '../../src/routes/power-pool/+page.svelte';

beforeEach(() => {
  mockCreateSponsorOrder.mockClear();
  mockFetchSponsorStats.mockClear();
});

describe('Power Pool Page', () => {
  it('renders page title', () => {
    const { container } = render(PowerPoolPage);
    const title = container.querySelector('.page-title');
    expect(title).toBeTruthy();
    expect(title.textContent).toContain('動力池');
  });

  it('renders flywheel section with 5 steps', () => {
    const { container } = render(PowerPoolPage);
    const steps = container.querySelectorAll('.flywheel-step');
    expect(steps.length).toBe(5);
  });

  it('renders sponsor section with coming soon placeholder', () => {
    const { container } = render(PowerPoolPage);
    const comingSoon = container.querySelector('.sponsor-coming-soon');
    expect(comingSoon).toBeTruthy();
    expect(comingSoon.textContent).toContain('即將開放');
  });

  it('renders sponsor stats section title', () => {
    const { container } = render(PowerPoolPage);
    const sections = container.querySelectorAll('.section-title');
    const statsTitle = Array.from(sections).find(el => el.textContent.includes('贊助透明統計'));
    expect(statsTitle).toBeTruthy();
  });

  it('renders transparency section with 3 items including reward highlight', () => {
    const { container } = render(PowerPoolPage);
    const items = container.querySelectorAll('.transparency-item');
    expect(items.length).toBe(3);
    const highlight = container.querySelector('.transparency-item.highlight');
    expect(highlight).toBeTruthy();
    expect(highlight.textContent).toContain('回饋機制');
  });

  it('renders reward badge with "未開放"', () => {
    const { container } = render(PowerPoolPage);
    const badge = container.querySelector('.reward-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('未開放');
  });

  it('renders report preview with direction badge', () => {
    const { container } = render(PowerPoolPage);
    const badge = container.querySelector('.rp-direction-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('多元');
  });

  it('renders 5 source rows in report preview', () => {
    const { container } = render(PowerPoolPage);
    const rows = container.querySelectorAll('.rp-source-row');
    expect(rows.length).toBe(5);
  });

  it('renders 3 camp cards in report preview', () => {
    const { container } = render(PowerPoolPage);
    const cards = container.querySelectorAll('.rp-camp-card');
    expect(cards.length).toBe(3);
  });

  it('renders report summary text', () => {
    const { container } = render(PowerPoolPage);
    const summary = container.querySelector('.rp-summary');
    expect(summary).toBeTruthy();
    expect(summary.textContent).toContain('此議題呈現多元觀點');
  });

  it('renders report preview badge with "範例預覽"', () => {
    const { container } = render(PowerPoolPage);
    const badge = container.querySelector('.report-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('範例預覽');
  });

  it('calls fetchSponsorStats on mount', async () => {
    render(PowerPoolPage);
    // Allow microtask to run
    await new Promise(r => setTimeout(r, 10));
    expect(mockFetchSponsorStats).toHaveBeenCalled();
  });

  it('displays pool bars after stats load', async () => {
    const { container } = render(PowerPoolPage);
    await new Promise(r => setTimeout(r, 50));

    const poolRows = container.querySelectorAll('.pool-row');
    expect(poolRows.length).toBe(3);
  });

  it('displays KPI values after stats load', async () => {
    const { container } = render(PowerPoolPage);
    await new Promise(r => setTimeout(r, 50));

    const kpiValues = container.querySelectorAll('.kpi-value');
    expect(kpiValues.length).toBe(2);
    expect(kpiValues[0].textContent).toContain('1,200');
    expect(kpiValues[1].textContent).toContain('8');
  });
});
