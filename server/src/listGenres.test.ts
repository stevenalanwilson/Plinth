import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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

vi.mock('./services/artworkService', () => ({
  fetchArtwork: vi.fn().mockResolvedValue({ artworkUrl: null, appleMusicUrl: null }),
}));

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { musicBrainzFetch } from './repositories/musicBrainzClient';
import { inMemoryAuth } from './testing/inMemoryAuth';
import { generousDailyLimit } from './testing/generousDailyLimit';

// Lists of a genre, through the real routes. Apart from lists.test.ts because the lists routes
// limit writes to 20 a minute per address, shared by every test in a file, and that file uses
// nearly all of them.
const BLUE = '8e8a594f-2175-38c7-a871-abb68ec363e7';
const NEVERMIND = '1b022e01-4da6-387b-8658-8678046e4cef';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.mocked(musicBrainzFetch).mockImplementation(async (path: string) => {
    const id = path.match(/^release-group\/([0-9a-f-]{36})/)?.[1] ?? '';
    const known = {
      [BLUE]: { title: 'Kind of Blue', artist: 'Miles Davis', date: '1959-08-17' },
      [NEVERMIND]: { title: 'Nevermind', artist: 'Nirvana', date: '1991-09-24' },
    }[id];
    if (!known) return { ok: false, status: 404 } as Response;
    return {
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => ({
        id,
        title: known.title,
        'primary-type': 'Album',
        'first-release-date': known.date,
        'artist-credit': [{ name: known.artist }],
        genres: [],
      }),
    } as Response;
  });
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

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function newDeviceToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/devices`, { method: 'POST' });
  return ((await res.json()) as { token: string }).token;
}

function send(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const top = (qualifier: string, releaseGroupIds: string[]): unknown => ({
  kind: 'top',
  qualifier,
  releaseGroupIds,
});

describe('lists of a genre through the real API', () => {
  it('makes one beside the list for all time, each with its own code and title', async () => {
    const token = await newDeviceToken();
    const allTime = (await (
      await send('POST', '/lists', token, top('all-time', [BLUE]))
    ).json()) as { id: string };

    const res = await send('POST', '/lists', token, top('genre:hip-hop', [NEVERMIND]));
    const genre = (await res.json()) as { id: string; title: string; qualifier: string };

    expect(res.status).toBe(201);
    expect(genre).toMatchObject({ qualifier: 'genre:hip-hop', title: 'My top 3 hip-hop albums' });
    expect(genre.id).not.toBe(allTime.id);
    const mine = (await (await send('GET', '/lists', token)).json()) as {
      lists: { qualifier: string }[];
    };
    expect(mine.lists.map((list) => list.qualifier).sort()).toEqual(['all-time', 'genre:hip-hop']);
  });

  it('answers 409 to a second list of the same genre', async () => {
    const token = await newDeviceToken();
    await send('POST', '/lists', token, top('genre:jazz', []));

    expect((await send('POST', '/lists', token, top('genre:jazz', []))).status).toBe(409);
  });

  it.each(['genre:polka', 'genre:', 'Hip-hop', 'genre:HIP-HOP'])(
    'answers 400 for the qualifier %s, which no genre has',
    async (qualifier) => {
      const token = await newDeviceToken();

      expect((await send('POST', '/lists', token, top(qualifier, []))).status).toBe(400);
    },
  );
});
