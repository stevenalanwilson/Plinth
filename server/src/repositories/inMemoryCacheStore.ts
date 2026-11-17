import { CacheStore } from './cacheStore';

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryCacheStore(now: () => number = () => Date.now()): CacheStore {
  const entries = new Map<string, Entry>();

  return {
    async get(key: string): Promise<unknown> {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= now()) return null;
      return JSON.parse(entry.value) as unknown;
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      // Stored as JSON text so a caller can't change a cached value afterwards, and so this
      // store rejects what Postgres would (values that don't survive JSON).
      entries.set(key, { value: JSON.stringify(value), expiresAt: now() + ttlSeconds * 1000 });
    },

    async deleteExpired(): Promise<number> {
      let removed = 0;
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= now()) {
          entries.delete(key);
          removed++;
        }
      }
      return removed;
    },
  };
}
