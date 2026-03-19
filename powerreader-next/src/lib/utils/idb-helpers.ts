/**
 * PowerReader - IndexedDB Helpers
 *
 * Shared utilities for wrapping IDBRequest/IDBTransaction callbacks
 * into Promises. Used by auto-runner.js and manager.js.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

/**
 * Wrap an IDBRequest into a Promise.
 */
export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Wrap an IDBTransaction completion into a Promise.
 */
export function promisifyTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
