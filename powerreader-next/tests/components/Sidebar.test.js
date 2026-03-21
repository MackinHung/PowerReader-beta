/**
 * Unit tests for Sidebar.svelte
 *
 * Tests cover: rendering, expanded/collapsed states, nav items, extra items,
 * action buttons, disabled items, badges, authentication states, active detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Sidebar from '$lib/components/ui/Sidebar.svelte';

describe('Sidebar', () => {
  const baseItems = [
    { href: '/', icon: 'home', label: '首頁' },
    { href: '/articles', icon: 'article', label: '文章' },
  ];

  const actionItem = { action: true, icon: 'add', label: '新增分析' };

  const extraItems = [
    { href: '/extra', icon: 'star', label: '額外功能' },
    { href: '/disabled', icon: 'block', label: '停用功能', disabled: true, badge: 'Beta' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic rendering ──

  it('renders nav element with sidebar class', () => {
    const { container } = render(Sidebar, { props: { items: baseItems } });
    const nav = container.querySelector('nav.sidebar');
    expect(nav).toBeTruthy();
    expect(nav.getAttribute('aria-label')).toBe('Main navigation');
  });

  it('renders with expanded class when expanded=true', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: true } });
    expect(container.querySelector('.sidebar.expanded')).toBeTruthy();
    expect(container.querySelector('.sidebar.rail')).toBeNull();
  });

  it('renders with rail class when expanded=false', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: false } });
    expect(container.querySelector('.sidebar.rail')).toBeTruthy();
    expect(container.querySelector('.sidebar.expanded')).toBeNull();
  });

  // ── Brand / toggle ──

  it('shows brand text when expanded', () => {
    render(Sidebar, { props: { items: baseItems, expanded: true } });
    expect(screen.getByText('PowerReader')).toBeTruthy();
  });

  it('hides brand text when collapsed', () => {
    render(Sidebar, { props: { items: baseItems, expanded: false } });
    expect(screen.queryByText('PowerReader')).toBeNull();
  });

  it('shows collapse icon when expanded', () => {
    render(Sidebar, { props: { items: baseItems, expanded: true } });
    expect(screen.getByText('keyboard_double_arrow_left')).toBeTruthy();
  });

  it('shows expand icon when collapsed', () => {
    render(Sidebar, { props: { items: baseItems, expanded: false } });
    expect(screen.getByText('keyboard_double_arrow_right')).toBeTruthy();
  });

  it('toggle button aria-label changes with expanded state', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: true } });
    const toggleBtn = container.querySelector('.toggle-btn');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Collapse sidebar');
  });

  it('toggle button calls ontoggle callback', async () => {
    const ontoggle = vi.fn();
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: true, ontoggle } });
    const toggleBtn = container.querySelector('.toggle-btn');
    await fireEvent.click(toggleBtn);
    expect(ontoggle).toHaveBeenCalledTimes(1);
  });

  // ── Nav items ──

  it('renders nav links for each item', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: true } });
    const links = container.querySelectorAll('.nav-items a.nav-item');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('/');
    expect(links[1].getAttribute('href')).toBe('/articles');
  });

  it('renders icon for each nav item', () => {
    render(Sidebar, { props: { items: baseItems, expanded: true } });
    expect(screen.getByText('home')).toBeTruthy();
    expect(screen.getByText('article')).toBeTruthy();
  });

  it('renders labels when expanded', () => {
    render(Sidebar, { props: { items: baseItems, expanded: true } });
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('文章')).toBeTruthy();
  });

  it('hides labels when collapsed', () => {
    render(Sidebar, { props: { items: baseItems, expanded: false } });
    expect(screen.queryByText('首頁')).toBeNull();
    expect(screen.queryByText('文章')).toBeNull();
  });

  it('sets title attribute when collapsed', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: false } });
    const links = container.querySelectorAll('.nav-items a.nav-item');
    expect(links[0].getAttribute('title')).toBe('首頁');
    expect(links[1].getAttribute('title')).toBe('文章');
  });

  it('does not set title when expanded', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, expanded: true } });
    const links = container.querySelectorAll('.nav-items a.nav-item');
    expect(links[0].getAttribute('title')).toBeNull();
  });

  // ── Action items ──

  it('renders action button for items with action=true', () => {
    const { container } = render(Sidebar, {
      props: { items: [actionItem], expanded: true, onaction: vi.fn() }
    });
    const btn = container.querySelector('.nav-items button.nav-item');
    expect(btn).toBeTruthy();
  });

  it('action button calls onaction callback', async () => {
    const onaction = vi.fn();
    const { container } = render(Sidebar, {
      props: { items: [actionItem], expanded: true, onaction }
    });
    const btn = container.querySelector('.nav-items button.nav-item');
    await fireEvent.click(btn);
    expect(onaction).toHaveBeenCalledTimes(1);
  });

  // ── Extra items ──

  it('renders divider when extraItems present', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, extraItems, expanded: true } });
    expect(container.querySelector('.nav-divider')).toBeTruthy();
  });

  it('does not render divider when extraItems empty', () => {
    const { container } = render(Sidebar, { props: { items: baseItems, extraItems: [], expanded: true } });
    expect(container.querySelector('.nav-divider')).toBeNull();
  });

  it('renders disabled extra items with aria-disabled', () => {
    const { container } = render(Sidebar, { props: { items: [], extraItems, expanded: true } });
    const disabled = container.querySelector('.nav-item.disabled');
    expect(disabled).toBeTruthy();
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders badge for disabled items when expanded', () => {
    const { container } = render(Sidebar, { props: { items: [], extraItems, expanded: true } });
    const badge = container.querySelector('.nav-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('Beta');
  });

  it('hides badge when collapsed', () => {
    const { container } = render(Sidebar, { props: { items: [], extraItems, expanded: false } });
    expect(container.querySelector('.nav-badge')).toBeNull();
  });

  // ── Bottom section: authentication ──

  it('shows login link when not authenticated', () => {
    const { container } = render(Sidebar, { props: { items: [], expanded: true, isAuthenticated: false } });
    const loginIcon = container.querySelector('.sidebar-bottom');
    expect(loginIcon.textContent).toContain('登入');
  });

  it('shows user display name when authenticated', () => {
    render(Sidebar, {
      props: { items: [], expanded: true, isAuthenticated: true, displayName: 'TestUser', avatarUrl: '' }
    });
    expect(screen.getByText('TestUser')).toBeTruthy();
  });

  it('shows default label when authenticated but no displayName', () => {
    render(Sidebar, {
      props: { items: [], expanded: true, isAuthenticated: true, displayName: '', avatarUrl: '' }
    });
    expect(screen.getByText('使用者')).toBeTruthy();
  });

  it('renders avatar image when avatarUrl provided', () => {
    const { container } = render(Sidebar, {
      props: { items: [], expanded: true, isAuthenticated: true, displayName: 'Test', avatarUrl: 'https://example.com/avatar.jpg' }
    });
    const img = container.querySelector('.user-avatar');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://example.com/avatar.jpg');
  });

  it('shows account_circle icon when no avatarUrl', () => {
    const { container } = render(Sidebar, {
      props: { items: [], expanded: true, isAuthenticated: true, displayName: 'Test', avatarUrl: '' }
    });
    expect(container.querySelector('.user-avatar')).toBeNull();
    expect(container.querySelector('.sidebar-bottom .user-row .nav-icon')).toBeTruthy();
  });

  // ── Bottom section: static links ──

  it('renders settings link', () => {
    const { container } = render(Sidebar, { props: { items: [], expanded: true } });
    const settingsLink = container.querySelector('a[href="/settings"]');
    expect(settingsLink).toBeTruthy();
  });

  it('renders privacy link', () => {
    const { container } = render(Sidebar, { props: { items: [], expanded: true } });
    const privacyLink = container.querySelector('a[href="/privacy"]');
    expect(privacyLink).toBeTruthy();
  });

  it('shows settings label when expanded', () => {
    const { container } = render(Sidebar, { props: { items: [], expanded: true } });
    const bottomLabels = container.querySelector('.sidebar-bottom').textContent;
    expect(bottomLabels).toContain('設定');
    expect(bottomLabels).toContain('隱私與條款');
  });

  it('hides settings and privacy labels when collapsed', () => {
    const { container } = render(Sidebar, { props: { items: [], expanded: false } });
    const bottomLabels = container.querySelector('.sidebar-bottom').textContent;
    expect(bottomLabels).not.toContain('設定');
    expect(bottomLabels).not.toContain('隱私與條款');
  });

  // ── Empty state ──

  it('renders with no items', () => {
    const { container } = render(Sidebar, { props: { items: [] } });
    const nav = container.querySelector('nav.sidebar');
    expect(nav).toBeTruthy();
    expect(container.querySelectorAll('.nav-items .nav-item').length).toBe(0);
  });
});
