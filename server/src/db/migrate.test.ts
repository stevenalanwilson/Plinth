import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Pool } from 'pg';
import { migrate, MIGRATIONS_DIR } from './migrate';

interface FakeClient {
  readonly statements: string[];
  query: Mock<[string], Promise<{ rows: { name: string }[] }>>;
  release: Mock<[], void>;
}

function fakePool(
  alreadyApplied: readonly string[],
  failOn?: string,
): { pool: Pool; client: FakeClient } {
  const statements: string[] = [];
  const client: FakeClient = {
    statements,
    query: vi.fn(async (sql: string) => {
      statements.push(sql.trim());
      if (failOn && sql.includes(failOn)) throw new Error('syntax error');
      if (sql.startsWith('SELECT name FROM schema_migrations')) {
        return { rows: alreadyApplied.map((name) => ({ name })) };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'migrations-'));
  await writeFile(path.join(dir, '002_second.sql'), 'CREATE TABLE second ();');
  await writeFile(path.join(dir, '001_first.sql'), 'CREATE TABLE first ();');
  await writeFile(path.join(dir, 'README.md'), 'not a migration');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies pending migrations in filename order and records each one', async () => {
    const { pool, client } = fakePool([]);

    const applied = await migrate(pool, dir);

    expect(applied).toEqual(['001_first.sql', '002_second.sql']);
    const ran = client.statements.filter(
      (sql) => sql.startsWith('CREATE TABLE ') && !sql.includes('schema_migrations'),
    );
    expect(ran).toEqual(['CREATE TABLE first ();', 'CREATE TABLE second ();']);
    expect(client.query).toHaveBeenCalledWith('INSERT INTO schema_migrations (name) VALUES ($1)', [
      '002_second.sql',
    ]);
  });

  it('skips migrations that have already been applied', async () => {
    const { pool, client } = fakePool(['001_first.sql']);

    const applied = await migrate(pool, dir);

    expect(applied).toEqual(['002_second.sql']);
    expect(client.statements).not.toContain('CREATE TABLE first ();');
  });

  it('rolls back a failed migration, stops, and still releases the lock and client', async () => {
    const { pool, client } = fakePool([], 'CREATE TABLE first');

    await expect(migrate(pool, dir)).rejects.toThrow('syntax error');

    expect(client.statements).toContain('ROLLBACK');
    expect(client.statements).not.toContain('CREATE TABLE second ();');
    expect(client.statements.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
    expect(client.release).toHaveBeenCalled();
  });

  it('points at the server/migrations folder', () => {
    expect(MIGRATIONS_DIR.endsWith(path.join('server', 'migrations'))).toBe(true);
  });
});
