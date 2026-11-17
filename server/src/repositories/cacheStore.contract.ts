import { describe, it, expect, beforeEach } from 'vitest';
import { CacheStore } from './cacheStore';

/** Behaviour every CacheStore must share, so the in-memory one is a faithful stand-in. */
export function describeCacheStore(name: string, createStore: () => Promise<CacheStore>): void {
  describe(`${name} (CacheStore contract)`, () => {
    let cache: CacheStore;

    beforeEach(async () => {
      cache = await createStore();
    });

    it('returns null for a key it does not have', async () => {
      expect(await cache.get('missing')).toBeNull();
    });

    it('returns what was stored, including nested objects and arrays', async () => {
      const value = { 'release-groups': [{ id: 'a', score: 100 }], count: 1, note: null };

      await cache.set('search', value, 60);

      expect(await cache.get('search')).toEqual(value);
    });

    it('treats an entry past its expiry as missing', async () => {
      await cache.set('gone', { a: 1 }, 0);

      expect(await cache.get('gone')).toBeNull();
    });

    it('replaces an existing entry and gives it the new expiry', async () => {
      await cache.set('key', { version: 1 }, 0);

      await cache.set('key', { version: 2 }, 60);

      expect(await cache.get('key')).toEqual({ version: 2 });
    });

    it('keeps entries under different keys apart', async () => {
      await cache.set('a', { n: 1 }, 60);
      await cache.set('b', { n: 2 }, 60);

      expect(await cache.get('a')).toEqual({ n: 1 });
      expect(await cache.get('b')).toEqual({ n: 2 });
    });

    it('removes only expired entries and says how many', async () => {
      await cache.set('old-1', { n: 1 }, 0);
      await cache.set('old-2', { n: 2 }, 0);
      await cache.set('live', { n: 3 }, 60);

      expect(await cache.deleteExpired()).toBe(2);

      expect(await cache.get('live')).toEqual({ n: 3 });
      expect(await cache.deleteExpired()).toBe(0);
    });
  });
}
