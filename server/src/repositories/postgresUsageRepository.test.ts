import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeUsageRepository } from './usageRepository.contract';
import { createPostgresUsageRepository } from './postgresUsageRepository';

describe.skipIf(!testDatabaseUrl)('Postgres usage repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeUsageRepository('Postgres usage repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    return createPostgresUsageRepository(database.pool);
  });
});
