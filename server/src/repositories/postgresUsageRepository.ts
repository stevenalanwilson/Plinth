import { Pool } from 'pg';
import { UsageRepository } from './usageRepository';

export function createPostgresUsageRepository(pool: Pool): UsageRepository {
  return {
    async tryConsume(subject: string, day: string, limit: number): Promise<boolean> {
      // A limit below one lets nothing through, and the insert below would otherwise add the first.
      if (limit < 1) return false;
      // The WHERE on the conflict makes this one atomic step: at the limit the row isn't
      // touched and nothing comes back.
      const { rowCount } = await pool.query(
        `INSERT INTO daily_usage (subject, day, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (subject, day) DO UPDATE SET count = daily_usage.count + 1
         WHERE daily_usage.count < $3`,
        [subject, day, limit],
      );
      return (rowCount ?? 0) > 0;
    },

    async release(subject: string, day: string): Promise<void> {
      await pool.query(
        'UPDATE daily_usage SET count = GREATEST(count - 1, 0) WHERE subject = $1 AND day = $2',
        [subject, day],
      );
    },

    async deleteBefore(day: string): Promise<number> {
      const result = await pool.query('DELETE FROM daily_usage WHERE day < $1', [day]);
      return result.rowCount ?? 0;
    },
  };
}
