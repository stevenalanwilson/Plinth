import { describe, afterAll } from 'vitest';
import { createTestDatabase, testDatabaseUrl, TestDatabase } from '../db/testDatabase';
import { describeAlbumRepository } from './albumRepository.contract';
import { createPostgresAlbumRepository } from './postgresAlbumRepository';

describe.skipIf(!testDatabaseUrl)('Postgres album repository (needs TEST_DATABASE_URL)', () => {
  const databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
  });

  describeAlbumRepository('Postgres album repository', async () => {
    const database = await createTestDatabase();
    databases.push(database);
    return createPostgresAlbumRepository(database.pool);
  });
});
