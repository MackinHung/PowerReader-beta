/**
 * Unit tests for event-emitter.js
 */
import { describe, it, expect, vi } from 'vitest';
import { createEventEmitter } from '../../src/lib/utils/event-emitter.js';

describe('createEventEmitter', () => {
  it('returns an object with subscribe and notify methods', () => {
    const emitter = createEventEmitter('Test');
    expect(typeof emitter.subscribe).toBe('function');
    expect(typeof emitter.notify).toBe('function');
  });

  it('calls subscriber on notify', () => {
    const emitter = createEventEmitter('Test');
    const cb = vi.fn();
    emitter.subscribe(cb);

    emitter.notify({ x: 1 });

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith({ x: 1 });
  });

  it('supports multiple subscribers', () => {
    const emitter = createEventEmitter('Test');
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.subscribe(cb1);
    emitter.subscribe(cb2);

    emitter.notify('data');

    expect(cb1).toHaveBeenCalledWith('data');
    expect(cb2).toHaveBeenCalledWith('data');
  });

  it('unsubscribe stops further notifications', () => {
    const emitter = createEventEmitter('Test');
    const cb = vi.fn();
    const unsub = emitter.subscribe(cb);

    emitter.notify(1);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    emitter.notify(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('catches and logs listener errors without affecting other listeners', () => {
    const emitter = createEventEmitter('TestLabel');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badCb = vi.fn(() => { throw new Error('boom'); });
    const goodCb = vi.fn();

    emitter.subscribe(badCb);
    emitter.subscribe(goodCb);

    emitter.notify('val');

    expect(goodCb).toHaveBeenCalledWith('val');
    expect(errSpy).toHaveBeenCalledWith('[TestLabel] Listener error:', expect.any(Error));

    errSpy.mockRestore();
  });

  it('each emitter has independent listeners', () => {
    const e1 = createEventEmitter('A');
    const e2 = createEventEmitter('B');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    e1.subscribe(cb1);
    e2.subscribe(cb2);

    e1.notify('a');
    expect(cb1).toHaveBeenCalledWith('a');
    expect(cb2).not.toHaveBeenCalled();
  });

  it('notify with no subscribers does not throw', () => {
    const emitter = createEventEmitter('Empty');
    expect(() => emitter.notify('data')).not.toThrow();
  });
});
