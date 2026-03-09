/**
 * Unit tests for idb-helpers.js
 */
import { describe, it, expect, vi } from 'vitest';
import { promisifyRequest, promisifyTransaction } from '../../src/js/utils/idb-helpers.js';

describe('promisifyRequest', () => {
  it('resolves with result on onsuccess', async () => {
    const req = {};
    const promise = promisifyRequest(req);

    // Simulate IDB onsuccess
    req.result = 'data';
    req.onsuccess();

    await expect(promise).resolves.toBe('data');
  });

  it('rejects with error on onerror', async () => {
    const req = {};
    const promise = promisifyRequest(req);

    req.error = new Error('IDB fail');
    req.onerror();

    await expect(promise).rejects.toThrow('IDB fail');
  });

  it('resolves with null result', async () => {
    const req = {};
    const promise = promisifyRequest(req);

    req.result = null;
    req.onsuccess();

    await expect(promise).resolves.toBeNull();
  });
});

describe('promisifyTransaction', () => {
  it('resolves on oncomplete', async () => {
    const tx = {};
    const promise = promisifyTransaction(tx);

    tx.oncomplete();

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects with error on onerror', async () => {
    const tx = {};
    const promise = promisifyTransaction(tx);

    tx.error = new Error('TX fail');
    tx.onerror();

    await expect(promise).rejects.toThrow('TX fail');
  });
});
