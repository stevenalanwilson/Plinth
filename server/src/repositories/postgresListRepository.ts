import { Pool, PoolClient } from 'pg';
import { ListKind, ListQualifier } from '@shared/types';
import { inTransaction } from '../db/transaction';
import { ListExistsError, ListOwner, ListRepository, NewList, StoredList } from './listRepository';

interface ListRow {
  id: string;
  device_id: string | null;
  account_id: string | null;
  kind: ListKind;
  qualifier: ListQualifier;
  size: number;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, device_id, account_id, kind, qualifier, size, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';
const OWNER_INDEXES = new Set(['lists_device_kind_qualifier', 'lists_account_kind_qualifier']);

// Fixed strings, never built from a request, so they are safe to put in a query.
function ownerColumn(owner: ListOwner): 'device_id' | 'account_id' {
  return owner.kind === 'device' ? 'device_id' : 'account_id';
}

function toStoredList(row: ListRow, releaseGroupIds: readonly string[]): StoredList {
  const owner: ListOwner = row.device_id
    ? { kind: 'device', id: row.device_id }
    : { kind: 'account', id: row.account_id as string };
  return {
    id: row.id,
    owner,
    kind: row.kind,
    qualifier: row.qualifier,
    size: row.size,
    releaseGroupIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function albumsOf(
  client: Pool | PoolClient,
  listIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byList = new Map<string, string[]>(listIds.map((id) => [id, []]));
  if (listIds.length === 0) return byList;

  const { rows } = await client.query<{ list_id: string; release_group_id: string }>(
    `SELECT list_id, release_group_id FROM list_items
     WHERE list_id = ANY($1) ORDER BY list_id, position`,
    [listIds],
  );
  for (const row of rows) byList.get(row.list_id)?.push(row.release_group_id);
  return byList;
}

async function hydrate(client: Pool | PoolClient, rows: readonly ListRow[]): Promise<StoredList[]> {
  const albums = await albumsOf(
    client,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toStoredList(row, albums.get(row.id) ?? []));
}

async function insertAlbums(
  client: PoolClient,
  listId: string,
  releaseGroupIds: readonly string[],
): Promise<void> {
  if (releaseGroupIds.length === 0) return;
  await client.query(
    `INSERT INTO list_items (list_id, position, release_group_id)
     SELECT $1, t.position, t.release_group_id
     FROM unnest($2::uuid[]) WITH ORDINALITY AS t (release_group_id, position)`,
    [listId, releaseGroupIds],
  );
}

// Two people signing in, or one person on two devices, can reach one account at once.
function lockAccount(client: PoolClient, accountId: string): Promise<unknown> {
  return client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`lists:${accountId}`]);
}

function isOwnerClash(error: unknown): boolean {
  const { code, constraint } = error as { code?: string; constraint?: string };
  return code === UNIQUE_VIOLATION && constraint !== undefined && OWNER_INDEXES.has(constraint);
}

export function createPostgresListRepository(pool: Pool): ListRepository {
  return {
    async create(list: NewList): Promise<StoredList> {
      try {
        return await inTransaction(pool, async (client) => {
          if (list.owner.kind === 'account') await lockAccount(client, list.owner.id);
          const column = ownerColumn(list.owner);
          const { rows } = await client.query<ListRow>(
            `INSERT INTO lists (id, ${column}, kind, qualifier, size, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6)
             RETURNING ${COLUMNS}`,
            [list.id, list.owner.id, list.kind, list.qualifier, list.size, list.now],
          );
          await insertAlbums(client, list.id, list.releaseGroupIds);
          return toStoredList(rows[0], list.releaseGroupIds);
        });
      } catch (error) {
        if (isOwnerClash(error)) throw new ListExistsError();
        throw error;
      }
    },

    async findById(id: string): Promise<StoredList | null> {
      const { rows } = await pool.query<ListRow>(`SELECT ${COLUMNS} FROM lists WHERE id = $1`, [
        id,
      ]);
      return (await hydrate(pool, rows))[0] ?? null;
    },

    async findByOwner(owner: ListOwner): Promise<readonly StoredList[]> {
      const { rows } = await pool.query<ListRow>(
        `SELECT ${COLUMNS} FROM lists WHERE ${ownerColumn(owner)} = $1 ORDER BY created_at, id`,
        [owner.id],
      );
      return hydrate(pool, rows);
    },

    async replaceAlbums(
      id: string,
      owner: ListOwner,
      releaseGroupIds: readonly string[],
      now: Date,
    ): Promise<StoredList | null> {
      return inTransaction(pool, async (client) => {
        // Taking the row's lock first, so two changes to one list run one after the other.
        const { rows } = await client.query<ListRow>(
          `UPDATE lists SET updated_at = $3
           WHERE id = $1 AND ${ownerColumn(owner)} = $2
           RETURNING ${COLUMNS}`,
          [id, owner.id, now],
        );
        if (rows.length === 0) return null;

        await client.query('DELETE FROM list_items WHERE list_id = $1', [id]);
        await insertAlbums(client, id, releaseGroupIds);
        return toStoredList(rows[0], releaseGroupIds);
      });
    },

    async delete(id: string, owner: ListOwner): Promise<boolean> {
      const { rowCount } = await pool.query(
        `DELETE FROM lists WHERE id = $1 AND ${ownerColumn(owner)} = $2`,
        [id, owner.id],
      );
      return (rowCount ?? 0) > 0;
    },

    async moveToAccount(deviceId: string, accountId: string): Promise<void> {
      await inTransaction(pool, async (client) => {
        await lockAccount(client, accountId);
        const { rows: mine } = await client.query<ListRow>(
          `SELECT ${COLUMNS} FROM lists WHERE device_id = $1 FOR UPDATE`,
          [deviceId],
        );

        for (const list of mine) {
          const { rows: clashes } = await client.query<ListRow>(
            `SELECT ${COLUMNS} FROM lists
             WHERE account_id = $1 AND kind = $2 AND qualifier = $3 FOR UPDATE`,
            [accountId, list.kind, list.qualifier],
          );
          const clash = clashes[0];

          // Ties go to the account's list, which is already where the person will look.
          if (clash && clash.updated_at.getTime() >= list.updated_at.getTime()) {
            await client.query('DELETE FROM lists WHERE id = $1', [list.id]);
            continue;
          }
          if (clash) await client.query('DELETE FROM lists WHERE id = $1', [clash.id]);
          await client.query('UPDATE lists SET device_id = NULL, account_id = $2 WHERE id = $1', [
            list.id,
            accountId,
          ]);
        }
      });
    },

    async removeAllForAccount(accountId: string): Promise<void> {
      await pool.query('DELETE FROM lists WHERE account_id = $1', [accountId]);
    },
  };
}
