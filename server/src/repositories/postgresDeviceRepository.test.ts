import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeDeviceRepository } from './deviceRepository.contract';
import { createPostgresDeviceRepository } from './postgresDeviceRepository';

describe.skipIf(!testDatabaseUrl)('Postgres device repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeDeviceRepository('Postgres device repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    return createPostgresDeviceRepository(database.pool);
  });
});
