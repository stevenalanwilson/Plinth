import { describe, it, expect, vi, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';

// The real routes and their real rate limits. /api/v1/image allows 60 requests a minute, and a
// request without a url answers 400 straight away, so it can be counted without any network.
const IMAGE_LIMIT = 60;

let server: Server;

async function start(trustProxyHops: number): Promise<string> {
  server = createApp({ albums: createInMemoryAlbumRepository(), trustProxyHops }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function statusFor(baseUrl: string, visitor: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/v1/image`, { headers: { 'x-forwarded-for': visitor } });
  return res.status;
}

async function useUpTheLimit(baseUrl: string, visitor: string): Promise<number> {
  let last = 0;
  for (let request = 0; request < IMAGE_LIMIT + 1; request++) {
    last = await statusFor(baseUrl, visitor);
  }
  return last;
}

describe('rate limits behind a proxy', () => {
  it('count each visitor separately when the proxy in front is trusted', async () => {
    const baseUrl = await start(1);

    expect(await useUpTheLimit(baseUrl, '203.0.113.1')).toBe(429);

    expect(await statusFor(baseUrl, '203.0.113.2')).toBe(400);
  });

  it('would count everyone as one visitor if the proxy were not trusted', async () => {
    const baseUrl = await start(0);

    expect(await useUpTheLimit(baseUrl, '203.0.113.1')).toBe(429);

    expect(await statusFor(baseUrl, '203.0.113.2')).toBe(429);
  });
});
