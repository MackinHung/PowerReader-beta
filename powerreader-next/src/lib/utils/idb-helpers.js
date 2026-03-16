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
 *
 * @param {IDBRequest} request
 * @returns {Promise<any>} Resolves with request.result
 */
export function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Wrap an IDBTransaction completion into a Promise.
 *
 * @param {IDBTransaction} transaction
 * @returns {Promise<void>}
 */
export function promisifyTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
