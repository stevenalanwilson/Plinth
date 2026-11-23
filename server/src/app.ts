import path from 'path';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { ApiDependencies, createApiRouter } from './routes/api';
import { createAlbumPageHandler } from './controllers/albumPageController';
import { createListPageHandler } from './controllers/listPageController';

export interface AppDependencies extends ApiDependencies {
  /** The built client's index.html, or null when there is no build (development). */
  readonly indexTemplate?: string | null;
  /** Proxies between visitors and the app, so Express knows whose address to believe. */
  readonly trustProxyHops?: number;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  // Without this, behind a proxy every visitor has the proxy's address, and the rate limits
  // (which count by address) would be shared by everyone.
  app.set('trust proxy', dependencies.trustProxyHops ?? 0);

  app.use(helmet());
  const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. same-origin, server-to-server)
        if (!origin || origin === allowedOrigin) {
          callback(null, true);
        } else {
          logger.warn({ origin }, 'CORS rejected request from disallowed origin');
          callback(new Error('Not allowed by CORS'));
        }
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Unversioned because the Railway and Docker health checks are configured with this path.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Versioned so released apps keep working as the API grows: only add to v1, never break it.
  app.use('/api/v1', createApiRouter(dependencies));
  // Without this, unknown API paths fall through to the web app and return HTML with a 200.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Album and list pages carry their own link preview tags. These come before the catch-all
  // below, which would otherwise serve them the same index.html as every other page.
  if (dependencies.indexTemplate) {
    app.get(
      '/album/:slug',
      createAlbumPageHandler({
        albums: dependencies.albums,
        template: dependencies.indexTemplate,
      }),
    );
    app.get(
      '/list/:id',
      createListPageHandler({
        lists: dependencies.lists,
        albums: dependencies.albums,
        template: dependencies.indexTemplate,
      }),
    );
  }

  // Serve React client in production (static files built into public/)
  const clientDist = path.join(__dirname, '..', 'public');
  app.use(express.static(clientDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}
