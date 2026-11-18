import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Device, DeviceRepository } from './deviceRepository';

interface DeviceRow {
  id: string;
  created_at: Date;
  last_seen_at: Date;
}

function toDevice(row: DeviceRow): Device {
  return { id: row.id, createdAt: row.created_at, lastSeenAt: row.last_seen_at };
}

export function createPostgresDeviceRepository(pool: Pool): DeviceRepository {
  return {
    async create(tokenHash: string, now: Date): Promise<Device> {
      const { rows } = await pool.query<DeviceRow>(
        `INSERT INTO devices (id, token_hash, created_at, last_seen_at)
         VALUES ($1, $2, $3, $3)
         RETURNING id, created_at, last_seen_at`,
        [randomUUID(), tokenHash, now],
      );
      return toDevice(rows[0]);
    },

    async findByTokenHash(tokenHash: string): Promise<Device | null> {
      const { rows } = await pool.query<DeviceRow>(
        'SELECT id, created_at, last_seen_at FROM devices WHERE token_hash = $1',
        [tokenHash],
      );
      return rows[0] ? toDevice(rows[0]) : null;
    },

    async markSeen(id: string, now: Date): Promise<void> {
      await pool.query('UPDATE devices SET last_seen_at = $2 WHERE id = $1', [id, now]);
    },

    async deleteNotSeenSince(cutoff: Date): Promise<number> {
      const result = await pool.query('DELETE FROM devices WHERE last_seen_at < $1', [cutoff]);
      return result.rowCount ?? 0;
    },
  };
}
