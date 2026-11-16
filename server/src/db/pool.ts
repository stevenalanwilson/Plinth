import { Pool } from 'pg';
import { logger } from '../logger';

export function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  // An idle client losing its connection (e.g. a database restart) emits 'error' on the pool,
  // which would crash the process if nothing listened. The pool replaces the client itself.
  pool.on('error', (error) => {
    logger.error({ error: error.message }, 'idle database client error');
  });
  return pool;
}
