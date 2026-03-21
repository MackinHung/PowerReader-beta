/**
 * Unit tests for GlobalAutoRunnerBar.svelte
 *
 * Tests cover: visibility logic, minimized/expanded states, stats display,
 * pause/resume, stop, current article display, GPU toast, stop reason display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GlobalAutoRunnerBar from '$lib/components/analysis/GlobalAutoRunnerBar.svelte';

// Mock mediaQuery store
let mockIsMobile = false;
vi.mock('$lib/stores/mediaQuery.svelte.js', () => ({
  getMediaQueryStore: () => ({
    get isMobile() { return mockIsMobile; },
    get isTablet() { return false; },
    get isDesktop() { return !mockIsMobile; },
    sidebarExpanded: true,
    sidebarMode: 'expanded',
    toggleSidebar: vi.fn(),
  }),
}));

// Mock analysis store - configurable per test
let mockAnalysis = {};
const defaultMockAnalysis = () => ({
  isAutoRunning: false,
  isAutoPaused: false,
  autoStats: { analyzed: 0, skipped: 0, failed: 0 },
  autoCurrentArticle: null,
  autoStopReason: null,
  init: vi.fn(() => vi.fn()),
  resumeAuto: vi.fn(),
  pauseAuto: vi.fn(),
  forceStopAuto: vi.fn(),
});

vi.mock('$lib/stores/analysis.svelte.ts', () => ({
  getAnalysisStore: () => mockAnalysis,
}));

describe('GlobalAutoRunnerBar', () => {
  beforeEach(() => {
    mockIsMobile = false;
    mockAnalysis = defaultMockAnalysis();
    // Reset sessionStorage
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Visibility ──

  it('does not render when not auto running and not paused', () => {
    mockAnalysis.isAutoRunning = false;
    mockAnalysis.isAutoPaused = false;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.auto-runner-bar')).toBeNull();
    expect(container.querySelector('.auto-runner-badge')).toBeNull();
  });

  it('renders bar when auto running', () => {
    mockAnalysis.isAutoRunning = true;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.auto-runner-bar')).toBeTruthy();
  });

  it('renders bar when paused', () => {
    mockAnalysis.isAutoPaused = true;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.auto-runner-bar')).toBeTruthy();
  });

  // ── Bar title ──

  it('shows running title when running', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.isAutoPaused = false;
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('自動分析中')).toBeTruthy();
  });

  it('shows paused title when paused', () => {
    mockAnalysis.isAutoPaused = true;
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('自動分析（暫停）')).toBeTruthy();
  });

  // ── Stats display ──

  it('shows analyzed count', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStats = { analyzed: 5, skipped: 2, failed: 0 };
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('已分析 5')).toBeTruthy();
    expect(screen.getByText('略過 2')).toBeTruthy();
  });

  it('shows failed count when > 0', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStats = { analyzed: 3, skipped: 1, failed: 2 };
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('失敗 2')).toBeTruthy();
  });

  it('hides failed count when 0', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStats = { analyzed: 3, skipped: 1, failed: 0 };
    render(GlobalAutoRunnerBar);
    expect(screen.queryByText(/失敗/)).toBeNull();
  });

  // ── Current article ──

  it('shows current article title when running', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.isAutoPaused = false;
    mockAnalysis.autoCurrentArticle = { title: '分析中的文章' };
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('分析中的文章')).toBeTruthy();
  });

  it('hides current article when paused', () => {
    mockAnalysis.isAutoPaused = true;
    mockAnalysis.autoCurrentArticle = { title: '分析中的文章' };
    render(GlobalAutoRunnerBar);
    expect(screen.queryByText('分析中的文章')).toBeNull();
  });

  // ── Stop reason ──

  it('shows stop reason when present', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStopReason = 'API 配額用盡';
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('API 配額用盡')).toBeTruthy();
  });

  it('hides stop reason when null', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStopReason = null;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.stop-reason')).toBeNull();
  });

  // ── Pause / Resume button ──

  it('shows pause button when running', () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.isAutoPaused = false;
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('暫停')).toBeTruthy();
  });

  it('shows resume button when paused', () => {
    mockAnalysis.isAutoPaused = true;
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('繼續')).toBeTruthy();
  });

  it('calls pauseAuto when pause clicked', async () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.isAutoPaused = false;
    render(GlobalAutoRunnerBar);
    const btn = screen.getByText('暫停');
    await fireEvent.click(btn.closest('button'));
    expect(mockAnalysis.pauseAuto).toHaveBeenCalledTimes(1);
  });

  it('calls resumeAuto when resume clicked', async () => {
    mockAnalysis.isAutoPaused = true;
    render(GlobalAutoRunnerBar);
    const btn = screen.getByText('繼續');
    await fireEvent.click(btn.closest('button'));
    expect(mockAnalysis.resumeAuto).toHaveBeenCalledTimes(1);
  });

  // ── Stop button ──

  it('shows stop button', () => {
    mockAnalysis.isAutoRunning = true;
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('停止')).toBeTruthy();
  });

  it('calls forceStopAuto when stop clicked', async () => {
    mockAnalysis.isAutoRunning = true;
    render(GlobalAutoRunnerBar);
    const btn = screen.getByText('停止');
    await fireEvent.click(btn.closest('button'));
    expect(mockAnalysis.forceStopAuto).toHaveBeenCalledTimes(1);
  });

  // ── Minimize / Expand ──

  it('clicking minimize shows badge view', async () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStats = { analyzed: 7, skipped: 0, failed: 0 };
    const { container } = render(GlobalAutoRunnerBar);

    // Click the minimize button
    const minimizeBtn = container.querySelector('.bar-minimize');
    await fireEvent.click(minimizeBtn);

    // Should show the badge
    expect(container.querySelector('.auto-runner-badge')).toBeTruthy();
    expect(container.querySelector('.auto-runner-bar')).toBeNull();
  });

  it('badge shows analyzed count', async () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStats = { analyzed: 7, skipped: 0, failed: 0 };
    const { container } = render(GlobalAutoRunnerBar);

    const minimizeBtn = container.querySelector('.bar-minimize');
    await fireEvent.click(minimizeBtn);

    const badge = container.querySelector('.badge-count');
    expect(badge.textContent).toBe('7');
  });

  it('clicking badge expands bar again', async () => {
    mockAnalysis.isAutoRunning = true;
    mockAnalysis.autoStats = { analyzed: 5, skipped: 0, failed: 0 };
    const { container } = render(GlobalAutoRunnerBar);

    // Minimize
    const minimizeBtn = container.querySelector('.bar-minimize');
    await fireEvent.click(minimizeBtn);

    // Click badge to expand
    const badge = container.querySelector('.auto-runner-badge');
    await fireEvent.click(badge);

    expect(container.querySelector('.auto-runner-bar')).toBeTruthy();
    expect(container.querySelector('.auto-runner-badge')).toBeNull();
  });

  // ── Mobile class ──

  it('applies mobile class on mobile', () => {
    mockIsMobile = true;
    mockAnalysis.isAutoRunning = true;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.auto-runner-bar.mobile')).toBeTruthy();
  });

  it('does not apply mobile class on desktop', () => {
    mockIsMobile = false;
    mockAnalysis.isAutoRunning = true;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.auto-runner-bar.mobile')).toBeNull();
  });

  // ── Paused class ──

  it('applies paused class when paused', () => {
    mockAnalysis.isAutoPaused = true;
    const { container } = render(GlobalAutoRunnerBar);
    expect(container.querySelector('.auto-runner-bar.paused')).toBeTruthy();
  });

  // ── Psychology icon ──

  it('shows psychology icon in bar header', () => {
    mockAnalysis.isAutoRunning = true;
    render(GlobalAutoRunnerBar);
    expect(screen.getByText('psychology')).toBeTruthy();
  });
});
