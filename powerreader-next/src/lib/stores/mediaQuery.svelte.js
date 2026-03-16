/**
 * Responsive media query store using Svelte 5 runes.
 * Provides reactive `isMobile`, `isTablet`, `isDesktop`, and `sidebarMode`.
 */

const BREAKPOINT_TABLET = 768;
const BREAKPOINT_DESKTOP = 1024;
const STORAGE_KEY = 'sidebar_expanded';

let _instance = null;

/**
 * @returns {{ isMobile: boolean, isTablet: boolean, isDesktop: boolean, sidebarExpanded: boolean, sidebarMode: 'hidden'|'rail'|'expanded', toggleSidebar: () => void }}
 */
export function getMediaQueryStore() {
  if (_instance) return _instance;

  let width = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  let sidebarExpanded = $state(
    typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) !== 'false'
      : true
  );

  let isMobile = $derived(width < BREAKPOINT_TABLET);
  let isTablet = $derived(width >= BREAKPOINT_TABLET && width < BREAKPOINT_DESKTOP);
  let isDesktop = $derived(width >= BREAKPOINT_DESKTOP);

  let sidebarMode = $derived(
    isMobile ? 'hidden' : sidebarExpanded ? 'expanded' : 'rail'
  );

  if (typeof window !== 'undefined') {
    const onResize = () => { width = window.innerWidth; };
    window.addEventListener('resize', onResize, { passive: true });
  }

  function toggleSidebar() {
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
