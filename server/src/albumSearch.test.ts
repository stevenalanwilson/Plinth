import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

vi.mock('./repositories/musicBrainzClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./repositories/musicBrainzClient')>()),
  musicBrainzFetch: vi.fn(),
}));

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { musicBrainzFetch } from './repositories/musicBrainzClient';
import { inMemoryAuth } from './testing/inMemoryAuth';
import { generousDailyLimit } from './testing/generousDailyLimit';

// The real routes and middleware, with only MusicBrainz replaced. The search route lets 40
// requests a minute through per address and the limit is shared by every test in this file.
const mockFetch = vi.mocked(musicBrainzFetch);

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  mockFetch.mockReset();
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

describe('album search through the real API', () => {
  it('answers /albums/search with albums, rather than treating "search" as an album slug', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async (): Promise<unknown> => ({
        'release-groups': [
          {
            id: 'rg-1',
            title: 'Kind of Blue',
            'primary-type': 'Album',
            'first-release-date': '1959-08-17',
            'artist-credit': [{ name: 'Miles Davis' }],
          },
        ],
      }),
    } as Response);

    const res = await fetch(`${baseUrl}/api/v1/albums/search?q=miles%20kind`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { releaseGroupId: 'rg-1', artist: 'Miles Davis', album: 'Kind of Blue', year: '1959' },
      ],
    });
  });

  it('still serves an album by its slug', async () => {
    const res = await fetch(`${baseUrl}/api/v1/albums/miles-davis-kind-of-blue`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Album not found' });
  });

  it('answers 400 when nothing, or too little, was typed', async () => {
    expect((await fetch(`${baseUrl}/api/v1/albums/search`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/v1/albums/search?q=a`)).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('answers 503 when MusicBrainz can not be reached', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const res = await fetch(`${baseUrl}/api/v1/albums/search?q=miles`);

    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
