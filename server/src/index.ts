import dotenv from 'dotenv';
dotenv.config();

// Validate required environment variables before starting
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required but not set. Exiting.');
  process.exit(1);
}

import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { apiRouter } from './routes/api';

const app = express();
const port = process.env.PORT ?? '3001';

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
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

const server = app.listen(Number(port), () => {
  logger.info({ port }, 'Server running');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
