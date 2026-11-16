import path from 'path';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { apiRouter } from './routes/api';

export function createApp(): Express {
  const app = express();

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
  app.use('/api', apiRouter);

  // Serve React client in production (static files built into public/)
  const clientDist = path.join(__dirname, '..', 'public');
  app.use(express.static(clientDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}
