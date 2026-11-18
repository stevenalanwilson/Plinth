import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeDeviceRepository } from './deviceRepository.contract';
import { createPostgresAccountRepository } from './postgresAccountRepository';
import { createPostgresDeviceRepository } from './postgresDeviceRepository';

describe.skipIf(!testDatabaseUrl)('Postgres device repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeDeviceRepository('Postgres device repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const accounts = createPostgresAccountRepository(database.pool);
    let counter = 0;
    return {
      devices: createPostgresDeviceRepository(database.pool),
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
