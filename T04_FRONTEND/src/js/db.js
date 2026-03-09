/**
 * PowerReader - IndexedDB Setup
 *
 * Central database module for offline-first PWA.
 * All constants sourced from shared/config.js (FRONTEND section).
 *
 * Object stores:
 *   1. articles       - Cached news articles (keyPath: article_hash)
 *   2. user_analyses  - Local analysis results (autoIncrement id)
 *   3. cached_results - API response cache (keyPath: cache_key)
 *   4. pending_sync   - Offline queue for background sync (autoIncrement id)
 *   5. model_files    - Downloaded model binary chunks (keyPath: key)
 */

const DB_NAME = 'PowerReader';       // config.js FRONTEND.INDEXEDDB_NAME
const DB_VERSION = 2;                // config.js FRONTEND.INDEXEDDB_VERSION
const CACHE_DAYS = 10;               // config.js FRONTEND.INDEXEDDB_CACHE_DAYS

/**
 * Open (or create) the PowerReader IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. articles
      if (!db.objectStoreNames.contains('articles')) {
        const articles = db.createObjectStore('articles', { keyPath: 'article_hash' });
        articles.createIndex('by_source', 'source', { unique: false });
        articles.createIndex('by_status', 'status', { unique: false });
        articles.createIndex('by_published', 'published_at', { unique: false });
        articles.createIndex('by_cached_at', 'cached_at', { unique: false });
      }

      // 2. user_analyses
      if (!db.objectStoreNames.contains('user_analyses')) {
        const analyses = db.createObjectStore('user_analyses', { keyPath: 'id', autoIncrement: true });
        analyses.createIndex('by_article', 'article_hash', { unique: false });
        analyses.createIndex('by_synced', 'synced', { unique: false });
        analyses.createIndex('by_created', 'created_at', { unique: false });
      }

      // 3. cached_results
      if (!db.objectStoreNames.contains('cached_results')) {
        const cached = db.createObjectStore('cached_results', { keyPath: 'cache_key' });
        cached.createIndex('by_cached_at', 'cached_at', { unique: false });
      }

      // 4. pending_sync
      if (!db.objectStoreNames.contains('pending_sync')) {
        const pending = db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
        pending.createIndex('by_type', 'type', { unique: false });
        pending.createIndex('by_created', 'created_at', { unique: false });
      }

      // 5. model_files
      if (!db.objectStoreNames.contains('model_files')) {
        const models = db.createObjectStore('model_files', { keyPath: 'key' });
        models.createIndex('by_stored_at', 'stored_at', { unique: false });
      }

      // 6. auto_runner_history (v2)
      if (!db.objectStoreNames.contains('auto_runner_history')) {
        const history = db.createObjectStore('auto_runner_history', { keyPath: 'article_id' });
        history.createIndex('by_status', 'status', { unique: false });
        history.createIndex('by_analyzed_at', 'analyzed_at', { unique: false });
      }
    };
  });
}

/**
 * Delete articles and cached_results older than CACHE_DAYS.
 * Should be called on app startup and periodically.
 */
export async function cleanExpiredCache() {
  const db = await openDB();
  const cutoff = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  await cleanStoreByIndex(db, 'articles', 'by_cached_at', cutoff);
  await cleanStoreByIndex(db, 'cached_results', 'by_cached_at', cutoff);
  await cleanStoreByIndex(db, 'auto_runner_history', 'by_analyzed_at', cutoff30d);

  db.close();
}

/**
 * Delete all records in a store whose indexed date field is older than cutoff.
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} indexName
 * @param {string} cutoffISO - ISO date string threshold
 */
function cleanStoreByIndex(db, storeName, indexName, cutoffISO) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const range = IDBKeyRange.upperBound(cutoffISO);
    const cursor = index.openCursor(range);

    cursor.onsuccess = (event) => {
      const c = event.target.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Request persistent storage so the browser does not evict IndexedDB data.
 * Non-critical: logs result but does not throw.
 */
export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    if (granted) {
      console.log('[DB] Persistent storage granted');
    } else {
      console.warn('[DB] Persistent storage denied by browser');
    }
  }
}
