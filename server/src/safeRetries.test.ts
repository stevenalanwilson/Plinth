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
import { generousDailyLimit } from './testing/generousDailyLimit';
import { getRecommendation } from './services/recommendationService';

// The real routes and middleware, with only the Claude call replaced. The recommend route lets
// ten requests a minute through per address, and the limit is shared by every test in this file,
// so the tests below send fewer than that between them.
const mockGetRecommendation = vi.mocked(getRecommendation);

const PICK = { artist: 'Can', album: 'Tago Mago', year: '1971', reason: 'A great fit.' };
const KEY = '3f2b8c1e-9d4a-4e6b-8a57-1c0d2e3f4a5b';
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

beforeEach(async () => {
  mockGetRecommendation.mockReset();
  mockGetRecommendation.mockResolvedValue(PICK);
  server = createApp({
    albums: createInMemoryAlbumRepository(),
    devices: createInMemoryDeviceRepository(),
    dailyLimit: generousDailyLimit(),
    ...inMemoryAuth(),
    trustProxyHops: 0,
  }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function recommend(headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(BODY),
  });
}

async function newDeviceToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/devices`, { method: 'POST' });
  return ((await res.json()) as { token: string }).token;
}

describe('safe retries through the real API', () => {
  it('answers a retry from the first pick, and says so', async () => {
    const first = await recommend({ 'Idempotency-Key': KEY });
    const retry = await recommend({ 'Idempotency-Key': KEY });

    expect(await first.json()).toEqual(PICK);
    expect(await retry.json()).toEqual(PICK);
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    expect(retry.headers.get('idempotent-replayed')).toBe('true');
    expect(mockGetRecommendation).toHaveBeenCalledTimes(1);
  });

  it('does not answer one device with the pick another device asked for', async () => {
    const tokenA = await newDeviceToken();
    const tokenB = await newDeviceToken();

    await recommend({ 'Idempotency-Key': KEY, Authorization: `Bearer ${tokenA}` });
    await recommend({ 'Idempotency-Key': KEY, Authorization: `Bearer ${tokenB}` });
    await recommend({ 'Idempotency-Key': KEY, Authorization: `Bearer ${tokenA}` });

    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it('asks every time when no key is sent', async () => {
    await recommend();
    await recommend();

    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it('refuses a key that is not a UUID', async () => {
    const res = await recommend({ 'Idempotency-Key': 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(mockGetRecommendation).not.toHaveBeenCalled();
  });
});
