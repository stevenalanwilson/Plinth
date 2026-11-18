import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import express from 'express';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DeviceRepository } from '../repositories/deviceRepository';
import { createInMemoryDeviceRepository } from '../repositories/inMemoryDeviceRepository';
import { registerDevice } from '../services/deviceService';
import { createDeviceAuth, deviceOf } from './deviceAuth';
import { logger } from '../logger';

let server: Server;
let baseUrl: string;
let devices: DeviceRepository;

async function start(repository: DeviceRepository): Promise<void> {
  const app = express();
  app.use(createDeviceAuth(repository));
  app.get('/who', (_req, res) => {
    const device = deviceOf(res);
    res.json({ deviceId: device?.id ?? null });
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  vi.clearAllMocks();
  devices = createInMemoryDeviceRepository();
  await start(devices);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function who(
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/who`, { headers });
  return { status: res.status, body: await res.json() };
}

describe('device auth', () => {
  it('lets an anonymous request through, with no device', async () => {
    expect(await who()).toEqual({ status: 200, body: { deviceId: null } });
  });

  it('recognises the device a valid token belongs to', async () => {
    const { token, deviceId } = await registerDevice(devices);

    expect(await who({ authorization: `Bearer ${token}` })).toEqual({
      status: 200,
      body: { deviceId },
    });
  });

  it('accepts the scheme in any case', async () => {
    const { token, deviceId } = await registerDevice(devices);

    expect((await who({ authorization: `bearer ${token}` })).body).toEqual({ deviceId });
  });

  it('refuses a token that was never issued, with 401', async () => {
    const result = await who({ authorization: `Bearer pld_${'a'.repeat(43)}` });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Invalid or expired device token.' });
  });

  it.each(['Bearer', 'Bearer ', 'Basic abc', 'pld_abc', 'Bearer one two'])(
    'refuses the malformed header %j with 401',
    async (header) => {
      expect((await who({ authorization: header })).status).toBe(401);
    },
  );

  it('refuses a token unused for more than a year', async () => {
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const { token } = await registerDevice(devices, longAgo);

    expect((await who({ authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it('carries on as anonymous, and logs, when the database cannot be reached', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const broken: DeviceRepository = {
      ...createInMemoryDeviceRepository(),
      findByTokenHash: async () => {
        throw new Error('connection refused');
      },
    };
    await start(broken);

    const result = await who({ authorization: `Bearer pld_${'a'.repeat(43)}` });

    expect(result).toEqual({ status: 200, body: { deviceId: null } });
    expect(logger.error).toHaveBeenCalledWith(
      { error: 'connection refused' },
      'device lookup failed',
    );
  });

  it('never logs the token', async () => {
    const { token } = await registerDevice(devices);

    await who({ authorization: `Bearer ${token}` });
    await who({ authorization: `Bearer pld_${'b'.repeat(43)}` });

    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).not.toContain(token);
  });
});
