// PowerReader Next - Service Worker
const CACHE_NAME = 'pr-next-v3';
const APP_SHELL = [
  '/',
  '/200.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API requests: network-first
  if (url.hostname === 'powerreader-api.watermelom5404.workers.dev') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // SvelteKit hashed assets (_app/): cache-first (immutable)
  if (url.pathname.startsWith('/_app/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // CDN resources: cache-first
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.includes('huggingface.co')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Navigation: network-first, fallback to 200.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/200.html'))
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// =============================================
// Background Sync
// =============================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'pending-sync') {
    event.waitUntil(processPendingSyncInSW());
  }
});

async function processPendingSyncInSW() {
  const DB_NAME = 'PowerReader';
  const DB_VERSION = 2;
  const API_BASE = 'https://powerreader-api.watermelom5404.workers.dev/api/v1';

  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return;
  }

  let items, keys;
  try {
    const tx = db.transaction('pending_sync', 'readonly');
    const store = tx.objectStore('pending_sync');
    items = await idbRequest(store.getAll());
    keys = await idbRequest(store.getAllKeys());
  } catch {
    db.close();
    return;
  }

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = keys[i];

    try {
      let url, body;
      const headers = { 'Content-Type': 'application/json' };

      if (item.type === 'feedback') {
        url = `${API_BASE}/articles/${encodeURIComponent(item.payload.articleId)}/feedback`;
        body = JSON.stringify({ type: item.payload.feedbackType });
      } else if (item.type === 'analysis') {
        url = `${API_BASE}/articles/${encodeURIComponent(item.payload.articleId)}/analysis`;
        body = JSON.stringify(item.payload.data);
      } else {
        continue;
      }

      if (item.payload.token) {
        headers['Authorization'] = `Bearer ${item.payload.token}`;
      }

      const resp = await fetch(url, { method: 'POST', headers, body });
      if (resp.ok || resp.status === 409) {
        const delTx = db.transaction('pending_sync', 'readwrite');
        delTx.objectStore('pending_sync').delete(key);
        await new Promise(r => { delTx.oncomplete = r; });
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  db.close();

  // Notify frontend clients
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'sync-complete', synced, failed });
  }
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
