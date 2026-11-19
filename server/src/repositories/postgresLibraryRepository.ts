import { Pool, PoolClient } from 'pg';
import { LibraryItem } from '@shared/types';
import {
  LibraryChanges,
  LibraryFullError,
  LibraryRecord,
  LibraryRepository,
} from './libraryRepository';
import { expiredKeys, keyOfItem, overfills, planWrites } from '../services/libraryMerge';

interface LibraryRow {
  item_key: string;
  item: LibraryItem | null;
  removed_at: Date | null;
  updated_at: Date;
}

function toRecord(row: LibraryRow): LibraryRecord {
  if (row.item) {
    return { kind: 'album', key: row.item_key, item: row.item, updatedAt: row.updated_at };
  }
  return {
    kind: 'removed',
    key: row.item_key,
    removedAt: row.removed_at as Date,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'item_key, item, removed_at, updated_at';

async function countRecords(client: PoolClient, accountId: string): Promise<number> {
  const { rows } = await client.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM library_items WHERE account_id = $1',
    [accountId],
  );
  return rows[0].total;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresLibraryRepository(pool: Pool): LibraryRepository {
  return {
    async sync(accountId: string, changes: LibraryChanges): Promise<readonly LibraryRecord[]> {
      return inTransaction(pool, async (client) => {
        // One sync at a time per account, so two devices saving at once can't each read the same
        // old row and overwrite the other's change. Held until the transaction ends.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [accountId]);

        const before = await countRecords(client, accountId);
        const touched = [
          ...changes.items.map(keyOfItem),
          ...changes.deletions.map(({ key }) => key),
        ];
        const { rows: currentRows } = await client.query<LibraryRow>(
          `SELECT ${COLUMNS} FROM library_items WHERE account_id = $1 AND item_key = ANY($2)`,
          [accountId, touched],
        );
        const current = new Map(currentRows.map((row) => [row.item_key, toRecord(row)]));

        for (const record of planWrites(current, changes)) {
          await client.query(
            `INSERT INTO library_items (account_id, item_key, item, removed_at, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (account_id, item_key)
             DO UPDATE SET item = EXCLUDED.item, removed_at = EXCLUDED.removed_at,
                           updated_at = EXCLUDED.updated_at`,
            [
              accountId,
              record.key,
              record.kind === 'album' ? JSON.stringify(record.item) : null,
              record.kind === 'removed' ? record.removedAt : null,
              record.updatedAt,
            ],
          );
        }

        // Only what could have expired: removals, and albums with no verdict.
        const { rows: candidates } = await client.query<LibraryRow>(
          `SELECT ${COLUMNS} FROM library_items
           WHERE account_id = $1 AND (item IS NULL OR item->'feedback'->>'status' IS NULL)`,
          [accountId],
        );
        const expired = expiredKeys(candidates.map(toRecord), changes.now);
        if (expired.length > 0) {
          await client.query(
            'DELETE FROM library_items WHERE account_id = $1 AND item_key = ANY($2)',
            [accountId, expired],
          );
        }

        // Refused by throwing, which undoes everything this sync wrote.
        if (overfills(before, await countRecords(client, accountId), changes.maxRecords)) {
          throw new LibraryFullError(changes.maxRecords);
        }

        const { rows } = await client.query<LibraryRow>(
          `SELECT ${COLUMNS} FROM library_items
           WHERE account_id = $1 AND ($2::timestamptz IS NULL OR updated_at > $2)`,
          [accountId, changes.since],
        );
        return rows.map(toRecord);
      });
    },

    async removeAll(accountId: string): Promise<void> {
      await pool.query('DELETE FROM library_items WHERE account_id = $1', [accountId]);
    },
  };
}
