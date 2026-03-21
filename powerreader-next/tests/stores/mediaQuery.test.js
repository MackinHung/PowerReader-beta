/**
 * Unit tests for mediaQuery.svelte.ts (Media Query Store)
 *
 * Tests cover: getMediaQueryStore singleton, breakpoint detection,
 *              sidebarMode derivation, toggleSidebar, localStorage persistence.
 *
 * Strategy: Manipulate window.innerWidth and localStorage,
 *           use vi.resetModules() to reset singleton between test groups.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Dynamic module import ──

let mediaQueryModule;

async function loadModule() {
  return await import('../../src/lib/stores/mediaQuery.svelte.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  // Default: desktop width
  Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
  mediaQueryModule = await loadModule();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. Structure and Singleton
// ══════════════════════════════════════════════

describe('getMediaQueryStore — structure', () => {
  it('returns an object with expected properties', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(typeof store.isMobile).toBe('boolean');
    expect(typeof store.isTablet).toBe('boolean');
    expect(typeof store.isDesktop).toBe('boolean');
    expect(typeof store.sidebarExpanded).toBe('boolean');
    expect(typeof store.sidebarMode).toBe('string');
    expect(typeof store.toggleSidebar).toBe('function');
  });

  it('returns same instance on repeated calls (singleton)', () => {
    const store1 = mediaQueryModule.getMediaQueryStore();
    const store2 = mediaQueryModule.getMediaQueryStore();
    expect(store1).toBe(store2);
  });
});

// ══════════════════════════════════════════════
// 2. Desktop breakpoint (width >= 1024)
// ══════════════════════════════════════════════

describe('desktop mode (width >= 1024)', () => {
  it('isDesktop is true', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isDesktop).toBe(true);
    expect(store.isMobile).toBe(false);
    expect(store.isTablet).toBe(false);
  });

  it('sidebarMode is expanded by default', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.sidebarExpanded).toBe(true);
    expect(store.sidebarMode).toBe('expanded');
  });
});

// ══════════════════════════════════════════════
// 3. Tablet breakpoint (768 <= width < 1024)
// ══════════════════════════════════════════════

describe('tablet mode (768 <= width < 1024)', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
    mediaQueryModule = await loadModule();
  });

  it('isTablet is true', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isTablet).toBe(true);
    expect(store.isMobile).toBe(false);
    expect(store.isDesktop).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 4. Mobile breakpoint (width < 768)
// ══════════════════════════════════════════════

describe('mobile mode (width < 768)', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true, configurable: true });
    mediaQueryModule = await loadModule();
  });

  it('isMobile is true', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isMobile).toBe(true);
    expect(store.isTablet).toBe(false);
    expect(store.isDesktop).toBe(false);
  });

  it('sidebarMode is hidden on mobile', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.sidebarMode).toBe('hidden');
  });
});

// ══════════════════════════════════════════════
// 5. toggleSidebar
// ══════════════════════════════════════════════

describe('toggleSidebar', () => {
  it('toggles sidebarExpanded', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.sidebarExpanded).toBe(true);

    store.toggleSidebar();
    expect(store.sidebarExpanded).toBe(false);

    store.toggleSidebar();
    expect(store.sidebarExpanded).toBe(true);
  });

  it('persists to localStorage', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    store.toggleSidebar(); // true → false
    expect(localStorage.getItem('sidebar_expanded')).toBe('false');

    store.toggleSidebar(); // false → true
    expect(localStorage.getItem('sidebar_expanded')).toBe('true');
  });

  it('on desktop, collapsed sidebar gives rail mode', () => {
    const store = mediaQueryModule.getMediaQueryStore();
    store.toggleSidebar(); // collapse
    expect(store.sidebarMode).toBe('rail');
  });
});

// ══════════════════════════════════════════════
// 6. localStorage restore
// ══════════════════════════════════════════════

describe('localStorage restore', () => {
  it('restores sidebar_expanded=false from localStorage', async () => {
    vi.resetModules();
    localStorage.setItem('sidebar_expanded', 'false');
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
    mediaQueryModule = await loadModule();

    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.sidebarExpanded).toBe(false);
    expect(store.sidebarMode).toBe('rail');
  });

  it('defaults to true when no localStorage value', async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
    mediaQueryModule = await loadModule();

    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.sidebarExpanded).toBe(true);
    expect(store.sidebarMode).toBe('expanded');
  });
});

// ══════════════════════════════════════════════
// 7. Boundary values
// ══════════════════════════════════════════════

describe('boundary values', () => {
  it('width=768 is tablet (not mobile)', async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true, configurable: true });
    mediaQueryModule = await loadModule();

    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isMobile).toBe(false);
    expect(store.isTablet).toBe(true);
  });

  it('width=1024 is desktop (not tablet)', async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    mediaQueryModule = await loadModule();

    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isTablet).toBe(false);
    expect(store.isDesktop).toBe(true);
  });

  it('width=767 is mobile', async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 767, writable: true, configurable: true });
    mediaQueryModule = await loadModule();

    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isMobile).toBe(true);
  });

  it('width=1023 is tablet', async () => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1023, writable: true, configurable: true });
    mediaQueryModule = await loadModule();

    const store = mediaQueryModule.getMediaQueryStore();
    expect(store.isTablet).toBe(true);
    expect(store.isDesktop).toBe(false);
  });
});
