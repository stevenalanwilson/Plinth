import { describe, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeListRepository } from './listRepository.contract';
import { createPostgresAccountRepository } from './postgresAccountRepository';
import { createPostgresAlbumRepository } from './postgresAlbumRepository';
import { createPostgresDeviceRepository } from './postgresDeviceRepository';
import { createPostgresListRepository } from './postgresListRepository';

describe.skipIf(!testDatabaseUrl)('Postgres list repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeListRepository('Postgres list repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const accounts = createPostgresAccountRepository(database.pool);
    const devices = createPostgresDeviceRepository(database.pool);
    const albums = createPostgresAlbumRepository(database.pool);
    let counter = 0;
    return {
      lists: createPostgresListRepository(database.pool),
      newDeviceId: async (): Promise<string> => {
        counter += 1;
        const device = await devices.create(`hash-${counter}-${randomUUID()}`, new Date());
        return device.id;
      },
      newAccountId: async (): Promise<string> => {
        counter += 1;
        const { account } = await accounts.findOrCreateByEmail(
          `person${counter}@example.com`,
          new Date(),
        );
        return account.id;
      },
      newAlbumId: async (): Promise<string> => {
        counter += 1;
        const releaseGroupId = randomUUID();
        await albums.insert({
          releaseGroupId,
          slug: `artist-album-${counter}`,
          artist: 'Artist',
          album: `Album ${counter}`,
          year: '1999',
          hook: null,
          genres: [],
          country: null,
        });
        return releaseGroupId;
      },
    };
  });
});
