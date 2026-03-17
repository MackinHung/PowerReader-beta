/**
 * PowerReader - Offline Queue (Background Sync)
 *
 * Manages pending offline operations for background sync.
 * Enqueues feedback/analysis payloads to IndexedDB pending_sync store.
 * Processes queue when online, registers SW sync tag.
 *
 * Uses the existing 'pending_sync' IDB store (created in db.js).
 */

import { openDB } from './db.js';
import { promisifyRequest, promisifyTransaction } from '$lib/utils/idb-helpers.js';
import { API_BASE } from './api.js';

/**
 * Enqueue a pending operation for background sync.
 * @param {string} type - 'feedback' | 'analysis'
 * @param {Object} payload - Operation payload
 * @returns {Promise<void>}
 */
export async function enqueuePendingSync(type, payload) {
  const db = await openDB();
  const tx = db.transaction('pending_sync', 'readwrite');
  tx.objectStore('pending_sync').put({
    type,
    payload,
    created_at: new Date().toISOString()
  });
  await promisifyTransaction(tx);
  db.close();

  // Register background sync if SW available
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register('pending-sync');
      }
    }
  } catch (e) {
    // SW sync registration is best-effort
    console.warn('[OfflineQueue] Sync registration failed:', e);
  }
}

/**
 * Get count of pending sync items.
 * @returns {Promise<number>}
 */
export async function getPendingSyncCount() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending_sync', 'readonly');
    const count = await promisifyRequest(tx.objectStore('pending_sync').count());
    db.close();
    return count;
  } catch {
    return 0;
  }
}

/**
 * Process all pending sync items. Sends each to API, deletes on success.
 * @returns {Promise<{synced: number, failed: number}>}
 */
export async function processPendingSync() {
  let synced = 0;
  let failed = 0;

  try {
    const db = await openDB();
    const tx = db.transaction('pending_sync', 'readonly');
    const items = await promisifyRequest(tx.objectStore('pending_sync').getAll());
    const keys = await promisifyRequest(tx.objectStore('pending_sync').getAllKeys());
    db.close();

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
          // Success or duplicate — remove from queue
          const delDb = await openDB();
          const delTx = delDb.transaction('pending_sync', 'readwrite');
          delTx.objectStore('pending_sync').delete(key);
          await promisifyTransaction(delTx);
          delDb.close();
          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  } catch (e) {
    console.error('[OfflineQueue] Process failed:', e);
  }

  return { synced, failed };
}

/**
 * Clear all pending sync items.
 * @returns {Promise<void>}
 */
export async function clearPendingSync() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending_sync', 'readwrite');
    tx.objectStore('pending_sync').clear();
    await promisifyTransaction(tx);
    db.close();
  } catch (e) {
    console.error('[OfflineQueue] Clear failed:', e);
  }
}
