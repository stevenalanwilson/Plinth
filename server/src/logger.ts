import pino, { LoggerOptions } from 'pino';

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  // Request logging records every header, and a device token in Authorization would sign in as
  // that device, or as the account it belongs to, for anyone who could read the logs.
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
};

export const logger = pino(loggerOptions);
