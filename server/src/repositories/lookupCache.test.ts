import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../logger';
import { CacheStore } from './cacheStore';
import { createInMemoryCacheStore } from './inMemoryCacheStore';
import {
  cachedResponse,
  configureLookupCache,
  readCache,
  startCacheCleanup,
  writeCache,
} from './lookupCache';

const DATA = { 'release-groups': [{ id: 'rg-1' }] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

let store: CacheStore;

beforeEach(() => {
  vi.clearAllMocks();
  store = createInMemoryCacheStore();
  configureLookupCache(store);
});

afterEach(() => {
  configureLookupCache(null);
});

describe('cachedResponse', () => {
  it('fetches on a miss, returns the response, and serves the next call from the cache', async () => {
    const fetchIt = vi.fn(async () => jsonResponse(DATA));
    const options = {
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    };

    const first = await cachedResponse(options);
    const second = await cachedResponse(options);

    expect(fetchIt).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual(DATA);
    expect(second.status).toBe(200);
    expect(second.ok).toBe(true);
    expect(await second.json()).toEqual(DATA);
  });

  it('keeps separate namespaces apart', async () => {
    const fetchIt = vi.fn(async () => jsonResponse(DATA));

    await cachedResponse({
      namespace: 'musicbrainz',
      key: 'same',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    });
    await cachedResponse({
      namespace: 'itunes',
      key: 'same',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    });

    expect(fetchIt).toHaveBeenCalledTimes(2);
  });

  it('does not cache a response that is not ok, such as a 503', async () => {
    const fetchIt = vi.fn(async () => jsonResponse({ error: 'busy' }, 503));
    const options = {
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    };

    const first = await cachedResponse(options);
    await cachedResponse(options);

    expect(first.status).toBe(503);
    expect(fetchIt).toHaveBeenCalledTimes(2);
  });

  it('returns a body that is not JSON untouched, and does not cache it', async () => {
    const fetchIt = vi.fn(async () => new Response('<html>oops</html>', { status: 200 }));
    const options = {
      namespace: 'itunes',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    };

    const first = await cachedResponse(options);
    await cachedResponse(options);

    expect(await first.text()).toBe('<html>oops</html>');
    expect(fetchIt).toHaveBeenCalledTimes(2);
  });

  it('works out the lifetime from the parsed body', async () => {
    const ttlSeconds = vi.fn(() => 60);

    await cachedResponse({
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds,
      fetch: async (): Promise<Response> => jsonResponse(DATA),
    });

    expect(ttlSeconds).toHaveBeenCalledWith(DATA);
  });

  it('expires entries after their lifetime', async () => {
    let now = 1_000_000;
    configureLookupCache(createInMemoryCacheStore(() => now));
    const fetchIt = vi.fn(async () => jsonResponse(DATA));
    const options = {
      namespace: 'itunes',
      key: 'path',
      ttlSeconds: (): number => 100,
      fetch: fetchIt,
    };

    await cachedResponse(options);
    now += 99_000;
    await cachedResponse(options);
    expect(fetchIt).toHaveBeenCalledTimes(1);

    now += 1_000;
    await cachedResponse(options);
    expect(fetchIt).toHaveBeenCalledTimes(2);
  });

  it('does not store an entry with no lifetime', async () => {
    const fetchIt = vi.fn(async () => jsonResponse(DATA));
    const options = {
      namespace: 'itunes',
      key: 'path',
      ttlSeconds: (): number => 0,
      fetch: fetchIt,
    };

    await cachedResponse(options);
    await cachedResponse(options);

    expect(fetchIt).toHaveBeenCalledTimes(2);
  });

  it('logs a hit or a miss with the namespace, so the hit rate can be counted', async () => {
    const options = {
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: async (): Promise<Response> => jsonResponse(DATA),
    };

    await cachedResponse(options);
    await cachedResponse(options);

    expect(logger.info).toHaveBeenNthCalledWith(1, { namespace: 'musicbrainz' }, 'cache miss');
    expect(logger.info).toHaveBeenNthCalledWith(2, { namespace: 'musicbrainz' }, 'cache hit');
  });

  it('just fetches, and never reads the body, when no cache is configured', async () => {
    configureLookupCache(null);
    const response = { ok: true } as Response;
    const fetchIt = vi.fn(async () => response);

    const result = await cachedResponse({
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    });

    expect(result).toBe(response);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('treats a failing cache read as a miss and still fetches', async () => {
    configureLookupCache({
      ...createInMemoryCacheStore(),
      get: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const fetchIt = vi.fn(async () => jsonResponse(DATA));

    const result = await cachedResponse({
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: fetchIt,
    });

    expect(await result.json()).toEqual(DATA);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'musicbrainz', error: 'connection refused' }),
      'cache error',
    );
  });

  it('still returns the response when saving to the cache fails', async () => {
    configureLookupCache({
      ...createInMemoryCacheStore(),
      set: vi.fn().mockRejectedValue(new Error('disk full')),
    });

    const result = await cachedResponse({
      namespace: 'musicbrainz',
      key: 'path',
      ttlSeconds: (): number => 60,
      fetch: async (): Promise<Response> => jsonResponse(DATA),
    });

    expect(await result.json()).toEqual(DATA);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'disk full' }),
      'cache error',
    );
  });
});

describe('readCache and writeCache', () => {
  it('round-trips a value under a namespace, logging a miss then a hit', async () => {
    expect(await readCache('essentials', 'v1:can')).toBeNull();

    await writeCache('essentials', 'v1:can', { artist: 'Can' }, 60);

    expect(await readCache('essentials', 'v1:can')).toEqual({ artist: 'Can' });
    expect(logger.info).toHaveBeenCalledWith({ namespace: 'essentials' }, 'cache miss');
    expect(logger.info).toHaveBeenCalledWith({ namespace: 'essentials' }, 'cache hit');
  });

  it('does nothing when no cache is configured', async () => {
    configureLookupCache(null);

    await writeCache('essentials', 'v1:can', { artist: 'Can' }, 60);

    expect(await readCache('essentials', 'v1:can')).toBeNull();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('survives a failing store', async () => {
    configureLookupCache({
      ...createInMemoryCacheStore(),
      get: vi.fn().mockRejectedValue(new Error('down')),
      set: vi.fn().mockRejectedValue(new Error('down')),
    });

    expect(await readCache('essentials', 'k')).toBeNull();
    await expect(writeCache('essentials', 'k', {}, 60)).resolves.toBeUndefined();
  });
});

describe('startCacheCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes expired entries on every interval and logs how many', async () => {
    const deleteExpired = vi.fn().mockResolvedValueOnce(3).mockResolvedValue(0);
    const stop = startCacheCleanup({ ...createInMemoryCacheStore(), deleteExpired }, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(deleteExpired).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ removed: 3 }, 'cache entries expired');
    stop();
  });

  it('keeps running after a failed clean-up', async () => {
    const deleteExpired = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(1);
    const stop = startCacheCleanup({ ...createInMemoryCacheStore(), deleteExpired }, 1000);

    await vi.advanceTimersByTimeAsync(2000);

    expect(deleteExpired).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'down' }),
      'cache error',
    );
    stop();
  });

  it('stops when asked', async () => {
    const deleteExpired = vi.fn().mockResolvedValue(0);
    const stop = startCacheCleanup({ ...createInMemoryCacheStore(), deleteExpired }, 1000);

    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(deleteExpired).not.toHaveBeenCalled();
  });
});
