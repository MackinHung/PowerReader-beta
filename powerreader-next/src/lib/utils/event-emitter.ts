/**
 * PowerReader - Lightweight Event Emitter
 *
 * Shared observer pattern used by queue.js and auto-runner.js.
 * Each call returns an independent emitter (no shared state).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

export interface EventEmitter<T> {
  subscribe(callback: (data: T) => void): () => void;
  notify(data: T): void;
}

/**
 * Create an event emitter with subscribe/notify API.
 *
 * @param name - Label for error logging (e.g. 'Queue', 'AutoRunner')
 */
export function createEventEmitter<T>(name: string): EventEmitter<T> {
  const _listeners = new Set<(data: T) => void>();

  return {
    /**
     * Subscribe to events. Returns an unsubscribe function.
     */
    subscribe(callback: (data: T) => void): () => void {
      _listeners.add(callback);
      return () => { _listeners.delete(callback); };
    },

    /**
     * Notify all listeners with data. Errors in listeners are caught and logged.
     */
    notify(data: T): void {
      for (const cb of _listeners) {
        try { cb(data); } catch (e) { console.error(`[${name}] Listener error:`, e); }
      }
    }
  };
}
