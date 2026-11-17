import { logger } from '../logger';
import { CacheStore } from './cacheStore';

// Nothing is cached until the server configures a store at startup, so code and tests that
// don't care about caching behave exactly as if it didn't exist. A module-level setting
// matches how the logger and the MusicBrainz rate limiter are shared.
let store: CacheStore | null = null;

export function configureLookupCache(configured: CacheStore | null): void {
  store = configured;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A cache is an optimisation: when it fails, lookups carry on as if it had missed.
function logCacheError(namespace: string, error: unknown): void {
  logger.warn({ namespace, error: describeError(error) }, 'cache error');
}

function cacheKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

export async function readCache(namespace: string, key: string): Promise<unknown> {
  if (!store) return null;
  try {
    const value = await store.get(cacheKey(namespace, key));
    // One line per lookup, so hits ÷ (hits + misses) per namespace is the cache hit rate.
    logger.info({ namespace }, value === null ? 'cache miss' : 'cache hit');
    return value;
  } catch (error) {
    logCacheError(namespace, error);
    return null;
  }
}

export async function writeCache(
  namespace: string,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!store || ttlSeconds <= 0) return;
  try {
    await store.set(cacheKey(namespace, key), value, ttlSeconds);
  } catch (error) {
    logCacheError(namespace, error);
  }
}

interface CachedResponseOptions {
  readonly namespace: string;
  readonly key: string;
  /** How long to keep the response, worked out from its parsed JSON body. */
  readonly ttlSeconds: (body: unknown) => number;
  readonly fetch: () => Promise<Response>;
}

function asJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Serves a JSON response from the cache, or fetches it and keeps it. Only successful JSON
 * responses are kept: a 503 or an error page must never outlive the moment it happened.
 */
export async function cachedResponse(options: CachedResponseOptions): Promise<Response> {
  if (!store) return options.fetch();

  const cached = await readCache(options.namespace, options.key);
  if (cached !== null) return asJsonResponse(cached);

  const response = await options.fetch();
  if (!response.ok) return response;

  try {
    // A clone, so the caller can still read the body.
    const body: unknown = await response.clone().json();
    await writeCache(options.namespace, options.key, body, options.ttlSeconds(body));
  } catch {
    // Not JSON: hand it back untouched and don't keep it.
  }
  return response;
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Removes expired entries every hour, so the table doesn't grow without bound. */
export function startCacheCleanup(
  cache: CacheStore,
  intervalMs: number = CLEANUP_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    cache
      .deleteExpired()
      .then((removed) => {
        if (removed > 0) logger.info({ removed }, 'cache entries expired');
      })
      .catch((error: unknown) => logCacheError('cleanup', error));
  }, intervalMs);
  // The timer must not keep the process alive on its own.
  timer.unref();
  return () => clearInterval(timer);
}
