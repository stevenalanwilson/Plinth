import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Account, AccountLookup, AccountRepository } from './accountRepository';

interface AccountRow {
  id: string;
  email: string;
  created_at: Date;
}

function toAccount(row: AccountRow): Account {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function createPostgresAccountRepository(pool: Pool): AccountRepository {
  return {
    async findOrCreateByEmail(email: string, now: Date): Promise<AccountLookup> {
      // DO NOTHING returns no row when the email exists, which is how a return is told from a
      // first sign-in, and two calls at once for a new email can't make two accounts.
      const inserted = await pool.query<AccountRow>(
        `INSERT INTO accounts (id, email, created_at) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, created_at`,
        [randomUUID(), email, now],
      );
      if (inserted.rows[0]) return { account: toAccount(inserted.rows[0]), created: true };

      const { rows } = await pool.query<AccountRow>(
        'SELECT id, email, created_at FROM accounts WHERE email = $1',
        [email],
      );
      return { account: toAccount(rows[0]), created: false };
    },

    async findById(id: string): Promise<Account | null> {
      const { rows } = await pool.query<AccountRow>(
        'SELECT id, email, created_at FROM accounts WHERE id = $1',
        [id],
      );
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await pool.query('DELETE FROM accounts WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}
