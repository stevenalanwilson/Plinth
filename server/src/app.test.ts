import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

vi.mock('./routes/api', async () => {
  const { Router } = await import('express');
  const router = Router();
  router.get('/ping', (_req, res) => {
    res.json({ pong: true });
  });
  return { apiRouter: router };
});

import { createApp } from './app';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('createApp routing', () => {
  it('serves the API under /api/v1', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ping`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it('keeps the health check unversioned for the Railway health check', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('no longer serves the API at its unversioned path', async () => {
    const res = await fetch(`${baseUrl}/api/ping`);

    expect(res.status).toBe(404);
  });

  it('answers unknown API paths with a JSON 404 rather than the web app', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nope`);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
