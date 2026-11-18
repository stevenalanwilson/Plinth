import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import express from 'express';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DeviceRepository } from '../repositories/deviceRepository';
import { createInMemoryDeviceRepository } from '../repositories/inMemoryDeviceRepository';
import { authenticateDevice } from '../services/deviceService';
import { createRegisterDeviceHandler } from './deviceController';
import { logger } from '../logger';

let server: Server;
let baseUrl: string;

async function start(devices: DeviceRepository): Promise<void> {
  const app = express();
  app.post('/devices', createRegisterDeviceHandler(devices));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('register device', () => {
  it('answers 201 with a token that then identifies a device', async () => {
    const devices = createInMemoryDeviceRepository();
    await start(devices);

    const res = await fetch(`${baseUrl}/devices`, { method: 'POST' });
    const body = (await res.json()) as { token: string };

    expect(res.status).toBe(201);
    expect(body.token).toMatch(/^pld_/);
    expect(await authenticateDevice(devices, body.token)).not.toBeNull();
  });

  it('sends nothing but the token', async () => {
    await start(createInMemoryDeviceRepository());

    const body = (await (await fetch(`${baseUrl}/devices`, { method: 'POST' })).json()) as object;

    expect(Object.keys(body)).toEqual(['token']);
  });

  it('forbids anything from keeping the token, which is shown once', async () => {
    await start(createInMemoryDeviceRepository());

    const res = await fetch(`${baseUrl}/devices`, { method: 'POST' });

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('gives each request its own token', async () => {
    await start(createInMemoryDeviceRepository());

    const tokens = await Promise.all(
      [1, 2, 3].map(async () => {
        const res = await fetch(`${baseUrl}/devices`, { method: 'POST' });
        return ((await res.json()) as { token: string }).token;
      }),
    );

    expect(new Set(tokens).size).toBe(3);
  });

  it('answers 500, and logs without the cause reaching the visitor, when it cannot save', async () => {
    await start({
      ...createInMemoryDeviceRepository(),
      create: async () => {
        throw new Error('connection refused to db.internal');
      },
    });

    const res = await fetch(`${baseUrl}/devices`, { method: 'POST' });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to register this device.' });
    expect(logger.error).toHaveBeenCalledWith(
      { error: 'connection refused to db.internal' },
      'device registration failed',
    );
  });
});
