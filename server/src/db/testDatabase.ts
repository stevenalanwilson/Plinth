import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { migrate } from './migrate';

/**
 * Database integration tests run only when TEST_DATABASE_URL is set (CI sets it). Each test
 * database lives in its own throwaway schema, so the URL can safely point at a dev database.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export interface TestDatabase {
  readonly pool: Pool;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const schema = `test_${randomUUID().replace(/-/g, '')}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  // A test's database lives until its file finishes, and a file makes one for every test, so
  // idle connections are let go quickly: otherwise the files running side by side hold more
  // connections than Postgres allows by default.
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`,
    idleTimeoutMillis: 100,
  });
  await migrate(pool);

  return {
    pool,
    async drop(): Promise<void> {
      await pool.end();
      const cleanup = new Pool({ connectionString: testDatabaseUrl, max: 1 });
      await cleanup.query(`DROP SCHEMA ${schema} CASCADE`);
      await cleanup.end();
    },
  };
}
