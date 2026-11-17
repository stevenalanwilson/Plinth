import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeCacheStore } from './cacheStore.contract';
import { createPostgresCacheStore } from './postgresCacheStore';

describe.skipIf(!testDatabaseUrl)('Postgres cache store (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeCacheStore('Postgres cache store', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    return createPostgresCacheStore(database.pool);
  });
});
