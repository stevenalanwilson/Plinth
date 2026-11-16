import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';

// Any fixed number will do; it only has to differ from other advisory locks on this database.
// The lock stops two instances starting at once from applying the same migration twice.
const MIGRATION_LOCK_ID = 7_242_001;

// server/migrations, from both src/db (tsx) and dist/db (the production build).
export const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

/**
 * Applies the .sql files in `dir` that haven't been applied yet, in filename order, each in
 * its own transaction, and returns the names it applied.
 */
export async function migrate(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    const pending = (await readdir(dir))
      .filter((file) => file.endsWith('.sql') && !applied.has(file))
      .sort();

    for (const name of pending) {
      const sql = await readFile(path.join(dir, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
