import { Pool } from 'pg';
import { CacheStore } from './cacheStore';

export function createPostgresCacheStore(pool: Pool): CacheStore {
  return {
    async get(key: string): Promise<unknown> {
      const { rows } = await pool.query<{ value: unknown }>(
        'SELECT value FROM cache_entries WHERE key = $1 AND expires_at > now()',
        [key],
      );
      return rows[0]?.value ?? null;
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      // JSON text rather than the value itself: pg turns a JS array into a Postgres array,
      // not JSON, so a cached list would be stored wrongly.
      await pool.query(
        `INSERT INTO cache_entries (key, value, expires_at)
         VALUES ($1, $2::jsonb, now() + make_interval(secs => $3))
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
        [key, JSON.stringify(value), ttlSeconds],
      );
    },

    async deleteExpired(): Promise<number> {
      const result = await pool.query('DELETE FROM cache_entries WHERE expires_at <= now()');
      return result.rowCount ?? 0;
    },
  };
}
