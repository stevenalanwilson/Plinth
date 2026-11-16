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
  const admin = new Pool({ connectionString: testDatabaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);

  const pool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema}` });
  await migrate(pool);

  return {
    pool,
    async drop(): Promise<void> {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
