/**
 * Tests for Point Shop page — Item display, category filter, purchase flow
 *
 * Covers:
 * - Shop grid rendering with items
 * - Category filter chips
 * - Points badge display
 * - Purchase confirmation dialog
 * - Inventory section
 * - Empty/loading states
 * - i18n key resolution
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

// ── Mock data ──

const MOCK_ITEMS = [
  {
    id: 'badge_civic_analyst',
    name_key: 'shop.item.badge_civic_analyst',
    description_key: 'shop.item.badge_civic_analyst_desc',
    cost_cents: 500,
    category: 'cosmetic',
    icon: 'verified',
    is_consumable: 0,
    duration_hours: null,
    max_per_user: 1,
    display_order: 1,
  },
  {
    id: 'badge_power_contributor',
    name_key: 'shop.item.badge_power_contributor',
    description_key: 'shop.item.badge_power_contributor_desc',
    cost_cents: 1500,
    category: 'cosmetic',
    icon: 'military_tech',
    is_consumable: 0,
    duration_hours: null,
    max_per_user: 1,
    display_order: 2,
  },
  {
    id: 'quota_boost_10',
    name_key: 'shop.item.quota_boost',
    description_key: 'shop.item.quota_boost_desc',
    cost_cents: 2000,
    category: 'functional',
    icon: 'add_circle',
    is_consumable: 1,
    duration_hours: 24,
    max_per_user: null,
    display_order: 10,
  },
];

const MOCK_INVENTORY = [
  {
    purchase_id: 1,
    item_id: 'badge_civic_analyst',
    cost_cents: 500,
    purchased_at: '2026-03-22T10:00:00Z',
    expires_at: null,
    is_consumed: 0,
    consumed_at: null,
    name_key: 'shop.item.badge_civic_analyst',
    description_key: 'shop.item.badge_civic_analyst_desc',
    category: 'cosmetic',
    icon: 'verified',
    is_consumable: 0,
    is_active: true,
  },
];

// ── Mock dependencies ──

const mockFetchShopItems = vi.fn().mockResolvedValue({
  success: true,
  data: { items: MOCK_ITEMS },
  error: null,
});

const mockPurchaseShopItem = vi.fn().mockResolvedValue({
  success: true,
  data: {
    item_id: 'badge_civic_analyst',
    cost_cents: 500,
    remaining_points_cents: 1500,
    display_remaining: '15.00',
    expires_at: null,
  },
  error: null,
});

const mockFetchInventory = vi.fn().mockResolvedValue({
  success: true,
  data: { inventory: MOCK_INVENTORY },
  error: null,
});

const mockUseShopItem = vi.fn().mockResolvedValue({
  success: true,
  data: { purchase_id: 2, item_id: 'quota_boost_10', effect_applied: true },
  error: null,
});

vi.mock('$lib/core/api.js', () => ({
  fetchShopItems: (...args) => mockFetchShopItems(...args),
  purchaseShopItem: (...args) => mockPurchaseShopItem(...args),
  fetchInventory: (...args) => mockFetchInventory(...args),
  useShopItem: (...args) => mockUseShopItem(...args),
}));

let mockIsAuthenticated = true;
let mockToken = 'test-jwt';
let mockUserPoints = { total_points_cents: 2000 };

vi.mock('$lib/stores/auth.svelte.js', () => ({
  getAuthStore: () => ({
    get token() { return mockToken; },
    get isAuthenticated() { return mockIsAuthenticated; },
    get userPoints() { return mockUserPoints; },
    get userProfile() { return { display_name: 'Test User' }; },
    fetchPoints: vi.fn().mockResolvedValue(undefined),
    fetchProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: (key, params = {}) => {
    const msgs = {
      'point_shop.title': '點數商店',
      'point_shop.subtitle': '使用貢獻點數兌換徽章、功能加成與進階服務',
      'point_shop.your_points': '目前點數',
      'point_shop.category.all': '全部',
      'point_shop.category.cosmetic': '外觀',
      'point_shop.category.functional': '功能',
      'point_shop.cost': `${params.cost} 點`,
      'point_shop.owned': '已擁有',
      'point_shop.buy': '兌換',
      'point_shop.confirm_title': '確認兌換',
      'point_shop.confirm_desc': `確定要用 ${params.cost} 點兌換「${params.name}」嗎？`,
      'point_shop.confirm_balance': `兌換後剩餘: ${params.remaining} 點`,
      'point_shop.purchase_success': '兌換成功',
      'point_shop.purchase_error': '兌換失敗',
      'point_shop.insufficient_points': '點數不足',
      'point_shop.login_required': '請先登入',
      'point_shop.empty': '商店準備中',
      'point_shop.inventory_title': '我的物品',
      'point_shop.inventory_empty': '尚未兌換任何物品',
      'point_shop.active': '生效中',
      'point_shop.permanent': '永久',
      'point_shop.consumable': '消耗品',
      'point_shop.use_item': '使用',
      'point_shop.use_success': '使用成功',
      'common.button.cancel': '取消',
      'shop.item.badge_civic_analyst': '公民分析師',
      'shop.item.badge_civic_analyst_desc': '認證徽章',
      'shop.item.badge_power_contributor': '動力貢獻者',
      'shop.item.badge_power_contributor_desc': '高級貢獻徽章',
      'shop.item.quota_boost': '分析加量包',
      'shop.item.quota_boost_desc': '增加 10 次分析額度',
    };
    return msgs[key] || key;
  },
}));

vi.mock('$lib/components/ui/Snackbar.svelte', () => ({
  default: vi.fn(),
  showSnackbar: vi.fn(),
}));

// Card.svelte renders children passthrough — no mock needed

// ── Setup ──

let PointShopPage;

beforeEach(async () => {
  vi.clearAllMocks();
  mockIsAuthenticated = true;
  mockToken = 'test-jwt';
  mockUserPoints = { total_points_cents: 2000 };
  mockFetchShopItems.mockResolvedValue({
    success: true,
    data: { items: MOCK_ITEMS },
    error: null,
  });
  mockFetchInventory.mockResolvedValue({
    success: true,
    data: { inventory: MOCK_INVENTORY },
    error: null,
  });

  const mod = await import('../../src/routes/point-shop/+page.svelte');
  PointShopPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──

describe('Point Shop Page', () => {
  it('renders shop title and subtitle', async () => {
    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('點數商店')).toBeTruthy();
    });
    expect(getByText('使用貢獻點數兌換徽章、功能加成與進階服務')).toBeTruthy();
  });

  it('displays user points badge when authenticated', async () => {
    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('20.00')).toBeTruthy();
    });
    expect(getByText('目前點數')).toBeTruthy();
  });

  it('renders category filter chips', async () => {
    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('全部')).toBeTruthy();
    });
    expect(getByText('外觀')).toBeTruthy();
    expect(getByText('功能')).toBeTruthy();
  });

  it('renders all shop items', async () => {
    const { getAllByText } = render(PointShopPage);
    await vi.waitFor(() => {
      // 公民分析師 appears in both shop grid and inventory
      expect(getAllByText('公民分析師').length).toBeGreaterThanOrEqual(1);
    });
    expect(getAllByText('動力貢獻者').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('分析加量包').length).toBeGreaterThanOrEqual(1);
  });

  it('shows item costs', async () => {
    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('5.00 點')).toBeTruthy();
    });
    expect(getByText('15.00 點')).toBeTruthy();
    expect(getByText('20.00 點')).toBeTruthy();
  });

  it('shows permanent/consumable tags', async () => {
    const { getAllByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getAllByText('永久').length).toBeGreaterThan(0);
    });
    expect(getAllByText('消耗品').length).toBeGreaterThan(0);
  });

  it('filters by cosmetic category', async () => {
    const { getAllByText, container } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getAllByText('公民分析師').length).toBeGreaterThanOrEqual(1);
    });

    // Click cosmetic filter
    const filterChips = container.querySelectorAll('.filter-chip');
    const cosmeticChip = Array.from(filterChips).find(c => c.textContent === '外觀');
    await fireEvent.click(cosmeticChip);

    // Shop grid should show cosmetic items only
    const itemNames = container.querySelectorAll('.item-name');
    const names = Array.from(itemNames).map(n => n.textContent);
    expect(names).toContain('公民分析師');
    expect(names).toContain('動力貢獻者');
    expect(names).not.toContain('分析加量包');
  });

  it('filters by functional category', async () => {
    const { getAllByText, container } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getAllByText('公民分析師').length).toBeGreaterThanOrEqual(1);
    });

    const filterChips = container.querySelectorAll('.filter-chip');
    const funcChip = Array.from(filterChips).find(c => c.textContent === '功能');
    await fireEvent.click(funcChip);

    const itemNames = container.querySelectorAll('.item-name');
    const names = Array.from(itemNames).map(n => n.textContent);
    expect(names).toContain('分析加量包');
    expect(names).not.toContain('公民分析師');
  });

  it('shows all items when "all" category selected', async () => {
    const { getAllByText, container } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getAllByText('公民分析師').length).toBeGreaterThanOrEqual(1);
    });

    // Switch to functional, then back to all
    const filterChips = container.querySelectorAll('.filter-chip');
    const funcChip = Array.from(filterChips).find(c => c.textContent === '功能');
    await fireEvent.click(funcChip);
    const allChip = Array.from(filterChips).find(c => c.textContent === '全部');
    await fireEvent.click(allChip);

    const itemNames = container.querySelectorAll('.item-name');
    const names = Array.from(itemNames).map(n => n.textContent);
    expect(names).toContain('公民分析師');
    expect(names).toContain('分析加量包');
  });

  it('shows "已擁有" badge for owned items', async () => {
    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('已擁有')).toBeTruthy();
    });
  });

  it('shows inventory section with active items', async () => {
    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('我的物品')).toBeTruthy();
    });
  });

  it('shows empty state when no items', async () => {
    mockFetchShopItems.mockResolvedValue({
      success: true,
      data: { items: [] },
      error: null,
    });

    const { getByText } = render(PointShopPage);
    await vi.waitFor(() => {
      expect(getByText('商店準備中')).toBeTruthy();
    });
  });

  it('calls fetchShopItems on mount', async () => {
    render(PointShopPage);
    await vi.waitFor(() => {
      expect(mockFetchShopItems).toHaveBeenCalled();
    });
  });

  it('calls fetchInventory for authenticated users', async () => {
    render(PointShopPage);
    await vi.waitFor(() => {
      expect(mockFetchInventory).toHaveBeenCalledWith('test-jwt');
    });
  });

  it('does not call fetchInventory for anonymous users', async () => {
    mockIsAuthenticated = false;
    mockToken = null;

    render(PointShopPage);
    await vi.waitFor(() => {
      expect(mockFetchShopItems).toHaveBeenCalled();
    });
    expect(mockFetchInventory).not.toHaveBeenCalled();
  });

  it('disables buy buttons when not authenticated', async () => {
    mockIsAuthenticated = false;
    mockToken = null;
    mockFetchInventory.mockResolvedValue({
      success: true,
      data: { inventory: [] },
      error: null,
    });

    const { container } = render(PointShopPage);
    await vi.waitFor(() => {
      const buyBtns = container.querySelectorAll('.buy-btn');
      expect(buyBtns.length).toBeGreaterThan(0);
      buyBtns.forEach(btn => {
        expect(btn.disabled).toBe(true);
      });
    });
  });
});
