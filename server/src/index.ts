import dotenv from 'dotenv';
dotenv.config();

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
