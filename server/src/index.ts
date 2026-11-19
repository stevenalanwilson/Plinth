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
import { trustProxyHops } from './utils/trustProxy';
import { createPool } from './db/pool';
import { migrate } from './db/migrate';
import { AlbumRepository } from './repositories/albumRepository';
import { createPostgresAlbumRepository } from './repositories/postgresAlbumRepository';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { CacheStore } from './repositories/cacheStore';
import { createPostgresCacheStore } from './repositories/postgresCacheStore';
import { createInMemoryCacheStore } from './repositories/inMemoryCacheStore';
import { configureLookupCache, startCacheCleanup } from './repositories/lookupCache';
import { DeviceRepository } from './repositories/deviceRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { createPostgresDeviceRepository } from './repositories/postgresDeviceRepository';
import { startDeviceCleanup } from './services/deviceService';
import { createInMemoryUsageRepository } from './repositories/inMemoryUsageRepository';
import { createPostgresUsageRepository } from './repositories/postgresUsageRepository';
import { UsageRepository } from './repositories/usageRepository';
import { createDailyPickLimiter, startUsageCleanup } from './services/dailyLimitService';
import { dailyPickLimits } from './utils/dailyLimits';
import { AccountRepository } from './repositories/accountRepository';
import { createInMemoryAccountRepository } from './repositories/inMemoryAccountRepository';
import { createPostgresAccountRepository } from './repositories/postgresAccountRepository';
import { SignInLinkRepository } from './repositories/signInLinkRepository';
import { createInMemorySignInLinkRepository } from './repositories/inMemorySignInLinkRepository';
import { createPostgresSignInLinkRepository } from './repositories/postgresSignInLinkRepository';
import { LibraryRepository } from './repositories/libraryRepository';
import { createInMemoryLibraryRepository } from './repositories/inMemoryLibraryRepository';
import { createPostgresLibraryRepository } from './repositories/postgresLibraryRepository';
import { startSignInLinkCleanup } from './services/signInService';
import { signInChannel } from './utils/signInChannel';

const port = process.env.PORT ?? '3001';

interface Storage {
  readonly albums: AlbumRepository;
  readonly devices: DeviceRepository;
  readonly usage: UsageRepository;
  readonly accounts: AccountRepository;
  readonly signInLinks: SignInLinkRepository;
  readonly library: LibraryRepository;
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
      devices: createInMemoryDeviceRepository(),
      usage: createInMemoryUsageRepository(),
      accounts: createInMemoryAccountRepository(),
      signInLinks: createInMemorySignInLinkRepository(),
      library: createInMemoryLibraryRepository(),
      cache: createInMemoryCacheStore(),
      pool: null,
    };
  }

  const pool = createPool(databaseUrl);
  const applied = await migrate(pool);
  if (applied.length > 0) logger.info({ applied }, 'database migrations applied');
  return {
    albums: createPostgresAlbumRepository(pool),
    devices: createPostgresDeviceRepository(pool),
    usage: createPostgresUsageRepository(pool),
    accounts: createPostgresAccountRepository(pool),
    signInLinks: createPostgresSignInLinkRepository(pool),
    library: createPostgresLibraryRepository(pool),
    cache: createPostgresCacheStore(pool),
    pool,
  };
}

async function start(): Promise<void> {
  // Checked first, so a bad value stops the server before it touches the database.
  const proxyHops = trustProxyHops(process.env);
  logger.info({ trustProxyHops: proxyHops }, 'trusting proxies for visitor addresses');

  const limits = dailyPickLimits(process.env);
  logger.info(limits, 'daily pick limits');

  const { channel, missing } = signInChannel(process.env);
  if (!channel) {
    logger.warn({ missing }, 'sign-in is switched off: these settings are missing');
  }

  const { albums, devices, usage, accounts, signInLinks, library, cache, pool } =
    await connectStorage();
  configureLookupCache(cache);
  const stopCacheCleanup = startCacheCleanup(cache);
  const stopDeviceCleanup = startDeviceCleanup(devices);
  const stopUsageCleanup = startUsageCleanup(usage);
  const stopSignInLinkCleanup = startSignInLinkCleanup(signInLinks);

  const indexTemplate = await loadIndexTemplate(path.join(__dirname, '..', 'public'));
  if (indexTemplate && !process.env.PUBLIC_URL) {
    logger.warn(
      'PUBLIC_URL is not set: link previews will use the address each request arrives on',
    );
  }

  const server = createApp({
    albums,
    devices,
    dailyLimit: createDailyPickLimiter({ usage, limits }),
    accounts,
    signInLinks,
    library,
    signInChannel: channel,
    indexTemplate,
    trustProxyHops: proxyHops,
  }).listen(Number(port), () => {
    logger.info({ port }, 'Server running');
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    stopCacheCleanup();
    stopDeviceCleanup();
    stopUsageCleanup();
    stopSignInLinkCleanup();
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
