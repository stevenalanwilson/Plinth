import { describe, it, expect, vi, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';

// The real routes: tokens are asked for at /api/v1/devices and checked on everything after it.
// /api/v1/image answers 400 straight away without a url, so it shows whether a request got past
// the check without touching the network.
const DEVICE_LIMIT = 30;

let server: Server;

async function start(trustProxyHops = 0): Promise<string> {
  server = createApp({
    albums: createInMemoryAlbumRepository(),
    devices: createInMemoryDeviceRepository(),
    trustProxyHops,
  }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function register(baseUrl: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/devices`, { method: 'POST', headers });
}

async function imageStatus(baseUrl: string, headers: Record<string, string> = {}): Promise<number> {
  return (await fetch(`${baseUrl}/api/v1/image`, { headers })).status;
}

describe('device tokens through the real API', () => {
  it('hands out a token, which is then accepted on other routes', async () => {
    const baseUrl = await start();

    const { token } = (await (await register(baseUrl)).json()) as { token: string };

    expect(await imageStatus(baseUrl, { authorization: `Bearer ${token}` })).toBe(400);
  });

  it('refuses a token that was not issued, on routes that never needed one', async () => {
    const baseUrl = await start();

    expect(await imageStatus(baseUrl, { authorization: `Bearer pld_${'a'.repeat(43)}` })).toBe(401);
  });

  it('still serves a request with no token at all', async () => {
    const baseUrl = await start();

    expect(await imageStatus(baseUrl)).toBe(400);
  });

  it('lets a client holding a stale token ask for a new one', async () => {
    const baseUrl = await start();

    const res = await register(baseUrl, { authorization: `Bearer pld_${'a'.repeat(43)}` });

    expect(res.status).toBe(201);
  });

  it('limits how many tokens one address can ask for in an hour', async () => {
    const baseUrl = await start();

    let last = 0;
    for (let request = 0; request < DEVICE_LIMIT + 1; request++) {
      last = (await register(baseUrl)).status;
    }

    expect(last).toBe(429);
  });

  it('counts each visitor separately behind a trusted proxy', async () => {
    const baseUrl = await start(1);

    for (let request = 0; request < DEVICE_LIMIT; request++) {
      await register(baseUrl, { 'x-forwarded-for': '203.0.113.1' });
    }

    expect((await register(baseUrl, { 'x-forwarded-for': '203.0.113.1' })).status).toBe(429);
    expect((await register(baseUrl, { 'x-forwarded-for': '203.0.113.2' })).status).toBe(201);
  });
});
