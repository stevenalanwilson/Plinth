import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeLibraryRepository } from './libraryRepository.contract';
import { createPostgresAccountRepository } from './postgresAccountRepository';
import { createPostgresLibraryRepository } from './postgresLibraryRepository';

describe.skipIf(!testDatabaseUrl)('Postgres library repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeLibraryRepository('Postgres library repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const accounts = createPostgresAccountRepository(database.pool);
    let counter = 0;
    return {
      library: createPostgresLibraryRepository(database.pool),
      newAccountId: async (): Promise<string> => {
        counter += 1;
        const { account } = await accounts.findOrCreateByEmail(
          `person${counter}@example.com`,
          new Date(),
        );
        return account.id;
      },
    };
  });
});
