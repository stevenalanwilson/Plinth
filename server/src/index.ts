import path from 'path';
import dotenv from 'dotenv';
// The .env file lives at the repo root, shared with Vite and Docker Compose, so load it from
// there rather than the working directory, which is server/ under `npm run dev`. In Docker and
// production the file isn't there and the variables come from the environment instead.
dotenv.config({ path: `${__dirname}/../../.env` });

// Validate required environment variables before starting
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required but not set. Exiting.');
  process.exit(1);
}

import { Pool } from 'pg';
import { logger } from './logger';
import { createApp } from './app';
import { loadIndexTemplate } from './utils/indexTemplate';
import { createPool } from './db/pool';
import { migrate } from './db/migrate';
import { AlbumRepository } from './repositories/albumRepository';
import { createPostgresAlbumRepository } from './repositories/postgresAlbumRepository';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { CacheStore } from './repositories/cacheStore';
import { createPostgresCacheStore } from './repositories/postgresCacheStore';
import { createInMemoryCacheStore } from './repositories/inMemoryCacheStore';
import { configureLookupCache, startCacheCleanup } from './repositories/lookupCache';

const port = process.env.PORT ?? '3001';

interface Storage {
  readonly albums: AlbumRepository;
  readonly cache: CacheStore;
  readonly pool: Pool | null;
}

async function connectStorage(): Promise<Storage> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    // Permalinks must outlive a restart in production, so running without a database is a
    // misconfiguration there, not a fallback.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production');
    }
    logger.warn('DATABASE_URL is not set: albums are stored in memory and lost on restart');
    return {
      albums: createInMemoryAlbumRepository(),
      cache: createInMemoryCacheStore(),
      pool: null,
    };
  }

  const pool = createPool(databaseUrl);
  const applied = await migrate(pool);
  if (applied.length > 0) logger.info({ applied }, 'database migrations applied');
  return {
    albums: createPostgresAlbumRepository(pool),
    cache: createPostgresCacheStore(pool),
    pool,
  };
}

async function start(): Promise<void> {
  const { albums, cache, pool } = await connectStorage();
  configureLookupCache(cache);
  const stopCacheCleanup = startCacheCleanup(cache);

  const indexTemplate = await loadIndexTemplate(path.join(__dirname, '..', 'public'));
  if (indexTemplate && !process.env.PUBLIC_URL) {
    logger.warn(
      'PUBLIC_URL is not set: link previews will use the address each request arrives on',
    );
  }

  const server = createApp({ albums, indexTemplate }).listen(Number(port), () => {
    logger.info({ port }, 'Server running');
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    stopCacheCleanup();
    server.close(() => {
      void (pool?.end() ?? Promise.resolve()).finally(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  });
}

start().catch((error: unknown) => {
  logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'startup failed');
  process.exit(1);
});
