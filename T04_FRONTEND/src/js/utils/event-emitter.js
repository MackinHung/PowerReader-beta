/**
 * PowerReader - Lightweight Event Emitter
 *
 * Shared observer pattern used by queue.js and auto-runner.js.
 * Each call returns an independent emitter (no shared state).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

/**
 * Create an event emitter with subscribe/notify API.
 *
 * @param {string} name - Label for error logging (e.g. 'Queue', 'AutoRunner')
 * @returns {{ subscribe: (cb: Function) => Function, notify: (data: any) => void }}
 */
export function createEventEmitter(name) {
  const _listeners = new Set();

  return {
    /**
     * Subscribe to events. Returns an unsubscribe function.
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    subscribe(callback) {
      _listeners.add(callback);
      return () => { _listeners.delete(callback); };
    },

    /**
     * Notify all listeners with data. Errors in listeners are caught and logged.
     * @param {any} data
     */
    notify(data) {
      for (const cb of _listeners) {
        try { cb(data); } catch (e) { console.error(`[${name}] Listener error:`, e); }
      }
    }
  };
}
