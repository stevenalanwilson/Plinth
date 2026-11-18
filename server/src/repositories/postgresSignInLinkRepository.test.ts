import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeSignInLinkRepository } from './signInLinkRepository.contract';
import { createPostgresSignInLinkRepository } from './postgresSignInLinkRepository';

describe.skipIf(!testDatabaseUrl)(
  'Postgres sign-in link repository (needs TEST_DATABASE_URL)',
  () => {
    const databases: TestDatabase[] = [];

    afterAll(async () => {
      await Promise.all(databases.map((database) => database.drop()));
    });

    describeSignInLinkRepository('Postgres sign-in link repository', async () => {
      const database = await createTestDatabase();
      databases.push(database);
      return createPostgresSignInLinkRepository(database.pool);
    });
  },
);
