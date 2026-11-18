import { Pool } from 'pg';
import { NewSignInLink, SignInLinkRepository } from './signInLinkRepository';

export function createPostgresSignInLinkRepository(pool: Pool): SignInLinkRepository {
  return {
    async create(link: NewSignInLink): Promise<void> {
      await pool.query(
        `INSERT INTO sign_in_links (token_hash, email, created_at, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [link.tokenHash, link.email, link.createdAt, link.expiresAt],
      );
    },

    async consume(tokenHash: string, now: Date): Promise<string | null> {
      // One statement, so two requests at once for a link can't both use it.
      const { rows } = await pool.query<{ email: string }>(
        `UPDATE sign_in_links SET used_at = $2
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
         RETURNING email`,
        [tokenHash, now],
      );
      return rows[0]?.email ?? null;
    },

    async countCreatedSince(email: string, since: Date): Promise<number> {
      const { rows } = await pool.query<{ count: string }>(
        'SELECT count(*) FROM sign_in_links WHERE email = $1 AND created_at >= $2',
        [email, since],
      );
      return Number(rows[0].count);
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await pool.query('DELETE FROM sign_in_links WHERE token_hash = $1', [tokenHash]);
    },

    async deleteForEmail(email: string): Promise<number> {
      const result = await pool.query('DELETE FROM sign_in_links WHERE email = $1', [email]);
      return result.rowCount ?? 0;
    },

    async deleteExpiredBefore(cutoff: Date): Promise<number> {
      const result = await pool.query('DELETE FROM sign_in_links WHERE expires_at < $1', [cutoff]);
      return result.rowCount ?? 0;
    },
  };
}
