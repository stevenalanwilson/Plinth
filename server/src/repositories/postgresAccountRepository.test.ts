import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeAccountRepository } from './accountRepository.contract';
import { createPostgresAccountRepository } from './postgresAccountRepository';

describe.skipIf(!testDatabaseUrl)('Postgres account repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeAccountRepository('Postgres account repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    return createPostgresAccountRepository(database.pool);
  });
});
