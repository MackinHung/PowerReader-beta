import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { shareCard } from '$lib/share/card-share.js';

// Polyfill URL.createObjectURL/revokeObjectURL for jsdom
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

describe('card-share', () => {
  let mockBlob;

  beforeEach(() => {
    mockBlob = new Blob(['fake-png'], { type: 'image/png' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('native share', () => {
    it('uses navigator.share when canShare supports files', async () => {
      const shareFn = vi.fn().mockResolvedValue(undefined);
      const canShareFn = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'share', { value: shareFn, configurable: true, writable: true });
      Object.defineProperty(navigator, 'canShare', { value: canShareFn, configurable: true, writable: true });

      const result = await shareCard(mockBlob, '測試');
      expect(result.method).toBe('native');
      expect(result.success).toBe(true);
      expect(shareFn).toHaveBeenCalledTimes(1);
      expect(shareFn.mock.calls[0][0].files).toHaveLength(1);
      expect(shareFn.mock.calls[0][0].title).toBe('測試');
    });
  });

  describe('download fallback', () => {
    it('downloads when navigator.share is not available', async () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true, writable: true });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
          return { href: '', download: '', click: clickSpy };
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

      const result = await shareCard(mockBlob, '測試');
      expect(result.method).toBe('download');
      expect(result.success).toBe(true);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('downloads when canShare returns false', async () => {
      Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true, writable: true });
      Object.defineProperty(navigator, 'canShare', { value: vi.fn().mockReturnValue(false), configurable: true, writable: true });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
          return { href: '', download: '', click: clickSpy };
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

      const result = await shareCard(mockBlob, '測試');
      expect(result.method).toBe('download');
      expect(result.success).toBe(true);
    });

    it('falls back to download when navigator.share throws', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockRejectedValue(new Error('AbortError')),
        configurable: true, writable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true, writable: true,
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
          return { href: '', download: '', click: clickSpy };
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

      const result = await shareCard(mockBlob, '測試');
      expect(result.method).toBe('download');
      expect(result.success).toBe(true);
    });
  });
});
