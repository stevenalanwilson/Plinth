import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

vi.mock('./services/recommendationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/recommendationService')>()),
  getRecommendation: vi.fn(),
}));

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { inMemoryAuth } from './testing/inMemoryAuth';
import { createInMemoryUsageRepository } from './repositories/inMemoryUsageRepository';
import { getRecommendation } from './services/recommendationService';
import { createDailyPickLimiter, DailyLimits } from './services/dailyLimitService';

// The real routes and middleware, with only the Claude call replaced. The recommend route lets
// ten requests a minute through per address, and that limit is shared by every test in this
// file, so the tests below send fewer than that between them.
const mockGetRecommendation = vi.mocked(getRecommendation);

const PICK = { artist: 'Can', album: 'Tago Mago', year: '1971', reason: 'A great fit.' };
const BODY = {
  preferences: {
    genres: [],
    moods: [],
    tempo: 5,
    energy: 5,
    density: 5,
    era: 'any',
    includeFamiliarArtists: true,
    prioritiseObscure: false,
    stayFocused: false,
  },
  alreadySuggested: [],
};

let server: Server;
let baseUrl: string;

async function start(limits: DailyLimits): Promise<void> {
  server = createApp({
    albums: createInMemoryAlbumRepository(),
    devices: createInMemoryDeviceRepository(),
    dailyLimit: createDailyPickLimiter({ usage: createInMemoryUsageRepository(), limits }),
    ...inMemoryAuth(),
    trustProxyHops: 0,
  }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  mockGetRecommendation.mockReset();
  mockGetRecommendation.mockResolvedValue(PICK);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function recommend(token?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(BODY),
  });
}

async function newDeviceToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/devices`, { method: 'POST' });
  return ((await res.json()) as { token: string }).token;
}

describe('daily limits through the real API', () => {
  it('turns a device away after its picks, with a friendly message, and not another device', async () => {
    await start({ perVisitor: 2, perAccount: 100, global: 100 });
    const tokenA = await newDeviceToken();
    const tokenB = await newDeviceToken();

    expect((await recommend(tokenA)).status).toBe(200);
    expect((await recommend(tokenA)).status).toBe(200);
    const limited = await recommend(tokenA);
    const other = await recommend(tokenB);

    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { error: string }).error).toContain("all 2 of today's picks");
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(other.status).toBe(200);
    expect(mockGetRecommendation).toHaveBeenCalledTimes(3);
  });

  it('stops every device once the day’s total is used', async () => {
    await start({ perVisitor: 5, perAccount: 5, global: 2 });
    const tokens = [await newDeviceToken(), await newDeviceToken(), await newDeviceToken()];

    const statuses = [];
    for (const token of tokens) statuses.push((await recommend(token)).status);

    expect(statuses).toEqual([200, 200, 429]);
    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it('counts a request with no device token by its address', async () => {
    await start({ perVisitor: 1, perAccount: 100, global: 100 });

    expect((await recommend()).status).toBe(200);
    expect((await recommend()).status).toBe(429);
  });
});
