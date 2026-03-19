/**
 * Responsive media query store using Svelte 5 runes.
 * Provides reactive `isMobile`, `isTablet`, `isDesktop`, and `sidebarMode`.
 */

import type { SidebarMode } from '$lib/types/stores.js';

interface MediaQueryStore {
  readonly isMobile: boolean;
  readonly isTablet: boolean;
  readonly isDesktop: boolean;
  readonly sidebarExpanded: boolean;
  readonly sidebarMode: SidebarMode;
  toggleSidebar: () => void;
}

const BREAKPOINT_TABLET = 768;
const BREAKPOINT_DESKTOP = 1024;
const STORAGE_KEY = 'sidebar_expanded';

let _instance: MediaQueryStore | null = null;

export function getMediaQueryStore(): MediaQueryStore {
  if (_instance) return _instance;

  let width: number = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  let sidebarExpanded: boolean = $state(
    typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) !== 'false'
      : true
  );

  let isMobile: boolean = $derived(width < BREAKPOINT_TABLET);
  let isTablet: boolean = $derived(width >= BREAKPOINT_TABLET && width < BREAKPOINT_DESKTOP);
  let isDesktop: boolean = $derived(width >= BREAKPOINT_DESKTOP);

  let sidebarMode: SidebarMode = $derived(
    isMobile ? 'hidden' : sidebarExpanded ? 'expanded' : 'rail'
  );

  if (typeof window !== 'undefined') {
    const onResize = () => { width = window.innerWidth; };
    window.addEventListener('resize', onResize, { passive: true });
  }

  function toggleSidebar(): void {
    sidebarExpanded = !sidebarExpanded;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(sidebarExpanded));
    }
  }

  _instance = {
    get isMobile() { return isMobile; },
    get isTablet() { return isTablet; },
    get isDesktop() { return isDesktop; },
    get sidebarExpanded() { return sidebarExpanded; },
    get sidebarMode() { return sidebarMode; },
    toggleSidebar
  };

  return _instance;
}
