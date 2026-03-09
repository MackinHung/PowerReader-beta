/**
 * PowerReader - Main App Entry Point
 *
 * Responsibilities:
 *   1. Apply i18n to all elements with data-i18n attribute
 *   2. Request persistent storage
 *   3. Clean expired IndexedDB cache
 *   4. Online/offline event listeners
 *   5. Simple hash-based router
 *   6. First-visit onboarding check
 */

import { t } from '../locale/zh-TW.js';
import { openDB, cleanExpiredCache, requestPersistentStorage } from './db.js';
import { renderHome } from './pages/home.js';
import { renderArticle } from './pages/article-detail.js';
import { renderAnalyze } from './pages/analyze.js';
import { renderProfile } from './pages/profile.js';
import { renderCompare } from './pages/compare.js';
import { renderSettings } from './pages/settings.js';
import { renderOnboarding } from './pages/onboarding.js';
import { setAuthCredentials } from './auth.js';
import { mountAutoRunnerStatus } from './components/auto-runner-status.js';

// --------------------------------------------------
// i18n: apply translations to data-i18n elements
// --------------------------------------------------
function applyI18n() {
  const elements = document.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  }
}

// --------------------------------------------------
// Online / Offline handling
// --------------------------------------------------
function setupConnectivityListeners() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  function updateStatus() {
    if (navigator.onLine) {
      banner.hidden = true;
    } else {
      banner.hidden = false;
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);

  // Set initial state
  updateStatus();
}

// --------------------------------------------------
// Onboarding: show on first visit
// --------------------------------------------------
function checkOnboarding() {
  const ONBOARDING_KEY = 'powerreader_onboarded';
  const hasOnboarded = localStorage.getItem(ONBOARDING_KEY);

  if (!hasOnboarded) {
    // Mark as onboarded for future visits
    localStorage.setItem(ONBOARDING_KEY, '1');
    navigateTo('onboarding');
  }
}

// --------------------------------------------------
// Router: simple hash-based routing
// --------------------------------------------------
const routes = {
  '/': renderHome,
  '/compare': renderCompare,
  '/analyze': renderAnalyze,
  '/profile': renderProfile,
  '/settings': renderSettings,
  '/onboarding': renderOnboarding
};

function getRouteAndParams() {
  const hash = window.location.hash.slice(1) || '/';

  // Check for parameterized routes
  const articleMatch = hash.match(/^\/article\/(.+)$/);
  if (articleMatch) {
    return { route: '/article', params: { hash: articleMatch[1] } };
  }

  const analyzeMatch = hash.match(/^\/analyze\/(.+)$/);
  if (analyzeMatch) {
    return { route: '/analyze_article', params: { hash: analyzeMatch[1] } };
  }

  // OAuth callback: #/auth/callback?token=xxx&session=xxx
  if (hash.startsWith('/auth/callback')) {
    return { route: '/auth/callback', params: {} };
  }

  return { route: hash, params: {} };
}

function handleRoute() {
  const { route, params } = getRouteAndParams();
  const content = document.getElementById('content');
  if (!content) return;

  // WCAG: Move focus to main content on route change
  content.setAttribute('tabindex', '-1');
  content.focus({ preventScroll: true });

  // Update bottom nav active state
  updateActiveNav(route);

  if (route === '/article') {
    renderArticle(content, params);
    return;
  }

  if (route === '/analyze_article') {
    renderAnalyze(content, params);
    return;
  }

  // Handle OAuth callback — store credentials and redirect
  if (route === '/auth/callback') {
    handleAuthCallback(content);
    return;
  }

  const renderFn = routes[route];
  if (renderFn) {
    renderFn(content);
  } else {
    renderHome(content);
  }
}

function navigateTo(route) {
  window.location.hash = `#/${route}`;
}

function updateActiveNav(currentRoute) {
  const navItems = document.querySelectorAll('.bottom-nav__item');
  for (const item of navItems) {
    const href = item.getAttribute('href');
    if (href === `#${currentRoute}`) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  }
}

// --------------------------------------------------
// OAuth callback handler
// --------------------------------------------------

/**
 * Handle OAuth callback: extract token from URL params, store credentials.
 */
function handleAuthCallback(container) {
  container.innerHTML = '';

  // Parse token and session from hash query string
  const hashPart = window.location.hash.slice(1); // Remove '#'
  const queryStart = hashPart.indexOf('?');
  const searchParams = queryStart >= 0
    ? new URLSearchParams(hashPart.slice(queryStart + 1))
    : new URLSearchParams();

  const token = searchParams.get('token');
  const session = searchParams.get('session');

  if (token && session) {
    setAuthCredentials(token, session);
    // Redirect to the original page or profile
    const redirect = searchParams.get('redirect') || '#/profile';
    window.location.hash = redirect.startsWith('#') ? redirect : `#${redirect}`;
  } else {
    const msg = document.createElement('p');
    msg.className = 'error-state';
    msg.textContent = t('login.failed');
    container.appendChild(msg);

    const homeBtn = document.createElement('button');
    homeBtn.className = 'btn btn--primary';
    homeBtn.textContent = t('nav.button.home');
    homeBtn.addEventListener('click', () => { window.location.hash = '#/'; });
    container.appendChild(homeBtn);
  }
}

// renderOnboarding imported from './pages/onboarding.js'

// --------------------------------------------------
// Listen for sync-failed messages from Service Worker
// --------------------------------------------------
function setupSWMessageListener() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'sync-failed-items') {
      console.warn('[App] Permanently failed sync items:', event.data.items);
      showSyncFailureBanner(event.data.items.length);
    }
  });
}

/**
 * Show persistent banner for permanently failed sync items.
 */
function showSyncFailureBanner(count) {
  // Avoid duplicate banners
  if (document.getElementById('sync-failure-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sync-failure-banner';
  banner.className = 'sync-failure-banner';
  banner.setAttribute('role', 'alert');

  const msg = document.createElement('span');
  msg.textContent = t('pwa.sync.failed_permanent');

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn--text';
  retryBtn.textContent = t('pwa.sync.retry_button');
  retryBtn.addEventListener('click', async () => {
    // Re-register background sync
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if ('sync' in reg) {
        await reg.sync.register('submit-pending');
      }
    }
    banner.remove();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'btn btn--text';
  dismissBtn.textContent = t('pwa.sync.discard_button');
  dismissBtn.addEventListener('click', () => {
    banner.remove();
  });

  banner.appendChild(msg);
  banner.appendChild(retryBtn);
  banner.appendChild(dismissBtn);

  document.body.insertBefore(banner, document.body.firstChild);
}

// --------------------------------------------------
// App initialization
// --------------------------------------------------
async function initApp() {
  // 0. Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('[SW] Registered:', reg.scope))
      .catch((err) => console.error('[SW] Registration failed:', err));
  }

  // 1. Apply i18n translations
  applyI18n();

  // 2. Request persistent storage
  await requestPersistentStorage();

  // 3. Clean expired cache
  try {
    await cleanExpiredCache();
  } catch (err) {
    console.error('[App] Failed to clean expired cache:', err);
  }

  // 4. Online/offline listeners
  setupConnectivityListeners();

  // 5. SW message listener
  setupSWMessageListener();

  // 5.5 Mount auto-runner floating status bar
  mountAutoRunnerStatus();

  // 6. Check for first-visit onboarding (BEFORE routing to avoid race condition)
  checkOnboarding();

  // 7. Setup router
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

document.addEventListener('DOMContentLoaded', initApp);

export { initApp, navigateTo };
