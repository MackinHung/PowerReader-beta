/**
 * PowerReader - Service Worker
 *
 * Handles offline caching, background sync, and network strategies.
 * TTL and cache settings sourced from shared/config.js (CLOUDFLARE.KV_STATIC_TTL).
 */

const STATIC_CACHE_NAME = 'static-v34';
const STATIC_CACHE_TTL_MS = 864000 * 1000; // 10 days (config.js CLOUDFLARE.KV_STATIC_TTL)
const MAX_SYNC_RETRIES = 5;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  // CSS
  '/css/main.css',
  '/css/article.css',
  '/css/analyze.css',
  '/css/profile.css',
  '/css/settings.css',
  '/css/onboarding.css',
  '/css/auto-runner.css',
  // JS - core
  '/js/app.js',
  '/js/db.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/utils/sanitize.js',
  '/js/utils/error.js',
  '/js/utils/score-categories.js',
  '/js/utils/device-detect.js',
  // JS - components
  '/js/components/bias-bar.js',
  '/js/components/controversy-badge.js',
  '/js/components/article-card.js',
  // JS - model
  '/js/model/manager.js',
  '/js/model/inference.js',
  '/js/model/prompt.js',
  '/js/model/output-parser.js',
  '/js/model/queue.js',
  '/js/model/auto-runner.js',
  '/js/model/gpu-database.js',
  // JS - components (new)
  '/js/components/auto-runner-status.js',
  '/js/pages/article-panels.js',
  // JS - pages
  '/js/pages/home.js',
  '/js/pages/article-detail.js',
  '/js/pages/analyze.js',
  '/js/pages/analyze-checks.js',
  '/js/pages/analyze-engine.js',
  '/js/pages/analyze-result.js',
  '/js/pages/analyze-helpers.js',
  '/js/pages/profile.js',
  '/js/pages/profile-points.js',
  '/js/pages/profile-contributions.js',
  '/js/pages/profile-helpers.js',
  '/js/pages/compare.js',
  '/js/pages/settings.js',
  '/js/pages/settings-helpers.js',
  '/js/pages/onboarding.js',
  // Locale
  '/locale/zh-TW.js'
];

// --------------------------------------------------
// Install: pre-cache static assets
// --------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// --------------------------------------------------
// Activate: clean old caches (version-filtered)
// --------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('static-') && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
  recoverFailedSyncItems();
});

// --------------------------------------------------
// Fetch: route to cacheFirst (static) or networkFirst (API)
// --------------------------------------------------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests use network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets use cache-first strategy with TTL
  event.respondWith(cacheFirst(event.request));
});

// --------------------------------------------------
// Background Sync: handle 'submit-pending' tag
// --------------------------------------------------
self.addEventListener('sync', (event) => {
  if (event.tag === 'submit-pending') {
    event.waitUntil(flushPendingSubmissions());
  }
});

// --------------------------------------------------
// Cache-first with TTL check
// --------------------------------------------------
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const cachedTime = cachedResponse.headers.get('x-cache-time');
    if (cachedTime) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age > STATIC_CACHE_TTL_MS) {
        // TTL expired, fetch fresh copy in background
        fetchAndCache(request, cache);
      }
    }
    return cachedResponse;
  }

  return fetchAndCache(request, cache);
}

/**
 * Fetch from network and store in cache with a timestamp header
 */
async function fetchAndCache(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cloned = networkResponse.clone();
      const headers = new Headers(cloned.headers);
      headers.set('x-cache-time', String(Date.now()));
      const body = await cloned.blob();
      const stamped = new Response(body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers
      });
      cache.put(request, stamped);
    }
    return networkResponse;
  } catch {
    // Return whatever is in cache as a last resort
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// --------------------------------------------------
// Network-first with IndexedDB fallback
// --------------------------------------------------
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      syncToIndexedDB(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline fallback: try IndexedDB cached result
    const cached = await getFromIndexedDB(request.url);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(
      JSON.stringify({ error: true, message: 'offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// --------------------------------------------------
// IndexedDB helpers (used from Service Worker context)
// --------------------------------------------------
function openSWDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('PowerReader', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    // If DB hasn't been created by app yet, create minimal stores
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cached_results')) {
        const store = db.createObjectStore('cached_results', { keyPath: 'cache_key' });
        store.createIndex('by_cached_at', 'cached_at');
      }
      if (!db.objectStoreNames.contains('pending_sync')) {
        const store = db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_type', 'type');
        store.createIndex('by_created', 'created_at');
      }
    };
  });
}

/**
 * Store a successful API response in IndexedDB for offline fallback
 */
async function syncToIndexedDB(request, response) {
  try {
    const data = await response.json();
    const db = await openSWDatabase();
    const tx = db.transaction('cached_results', 'readwrite');
    const store = tx.objectStore('cached_results');
    store.put({
      cache_key: request.url,
      data,
      cached_at: new Date().toISOString()
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-critical: silently continue if cache write fails
  }
}

/**
 * Retrieve a cached API response from IndexedDB
 */
async function getFromIndexedDB(url) {
  try {
    const db = await openSWDatabase();
    const tx = db.transaction('cached_results', 'readonly');
    const store = tx.objectStore('cached_results');
    const result = await new Promise((resolve, reject) => {
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result ? result.data : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------
// Background Sync: flush pending submissions
// --------------------------------------------------
async function flushPendingSubmissions() {
  try {
    const db = await openSWDatabase();
    const tx = db.transaction('pending_sync', 'readwrite');
    const store = tx.objectStore('pending_sync');

    const allItems = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    for (const item of allItems) {
      const retries = item.retry_count || 0;

      if (retries >= MAX_SYNC_RETRIES) {
        // Mark as permanently failed instead of deleting
        item.status = 'failed_permanent';
        store.put(item);
        continue;
      }

      try {
        const response = await fetch(item.url, {
          method: item.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });

        if (response.ok) {
          store.delete(item.id);
        } else {
          item.retry_count = retries + 1;
          item.last_error = `HTTP ${response.status}`;
          store.put(item);
        }
      } catch (err) {
        item.retry_count = retries + 1;
        item.last_error = err.message || 'Network error';
        store.put(item);
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[SW] Background sync flush failed, will retry:', err.message);
  }
}

// --------------------------------------------------
// Recover items that exceeded max retries
// --------------------------------------------------
async function recoverFailedSyncItems() {
  try {
    const db = await openSWDatabase();
    const tx = db.transaction('pending_sync', 'readonly');
    const store = tx.objectStore('pending_sync');

    const allItems = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const failedItems = allItems.filter((item) => item.status === 'failed_permanent');

    if (failedItems.length > 0) {
      // Notify all clients about permanently failed items
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({
          type: 'sync-failed-items',
          items: failedItems.map((item) => ({
            id: item.id,
            type: item.type,
            created_at: item.created_at
          }))
        });
      }
    }

    db.close();
  } catch (err) {
    console.warn('[SW] Failed sync recovery check:', err.message);
  }
}
