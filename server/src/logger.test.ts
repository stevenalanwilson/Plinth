import { describe, it, expect } from 'vitest';
import { AddressInfo } from 'net';
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Writable } from 'stream';
import { loggerOptions } from './logger';

// Request logging writes the request's headers, and a device token in the Authorization header
// is enough to act as that device, or as the account it is signed in to.
async function logLinesFor(headers: Record<string, string>): Promise<string> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      lines.push(chunk.toString());
      callback();
    },
  });
  const app = express();
  app.use(pinoHttp({ logger: pino(loggerOptions, stream) }));
  app.get('/ping', (_req, res) => {
    res.json({});
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  try {
    await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/ping`, { headers });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return lines.join('');
}

describe('request logging', () => {
  it('never writes a device token to the log', async () => {
    const logged = await logLinesFor({ Authorization: 'Bearer pld_secret-token-value' });

    expect(logged).toContain('/ping');
    expect(logged).not.toContain('pld_secret-token-value');
  });

  it('never writes a cookie to the log', async () => {
    const logged = await logLinesFor({ Cookie: 'session=secret-cookie-value' });

    expect(logged).not.toContain('secret-cookie-value');
  });

  it('still writes the rest of the request', async () => {
    const logged = await logLinesFor({ 'User-Agent': 'plinth-test-agent' });

    expect(logged).toContain('plinth-test-agent');
  });
});
