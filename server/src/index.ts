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

import { logger } from './logger';
import { createApp } from './app';

const port = process.env.PORT ?? '3001';

const server = createApp().listen(Number(port), () => {
  logger.info({ port }, 'Server running');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
