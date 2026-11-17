import { describe, it, expect } from 'vitest';
import { describeCacheStore } from './cacheStore.contract';
import { createInMemoryCacheStore } from './inMemoryCacheStore';

describeCacheStore('in-memory cache store', async () => createInMemoryCacheStore());

describe('in-memory cache store clock', () => {
  it('expires an entry when the clock reaches its expiry, not before', async () => {
    let now = 1_000_000;
    const cache = createInMemoryCacheStore(() => now);
    await cache.set('key', { a: 1 }, 10);

    now += 9_999;
    expect(await cache.get('key')).toEqual({ a: 1 });

    now += 1;
    expect(await cache.get('key')).toBeNull();
  });
});
