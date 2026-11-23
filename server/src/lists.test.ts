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

vi.mock('./services/artworkService', () => ({
  fetchArtwork: vi.fn().mockResolvedValue({ artworkUrl: null, appleMusicUrl: null }),
}));

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { musicBrainzFetch } from './repositories/musicBrainzClient';
import { inMemoryAuth } from './testing/inMemoryAuth';
import { generousDailyLimit } from './testing/generousDailyLimit';

// The real routes and middleware, with only MusicBrainz and the cover lookup replaced. The lists
// routes limit writes to 20 a minute per address, shared by every test in this file, so the tests
// below make fewer than that between them.
const mockFetch = vi.mocked(musicBrainzFetch);

const BLUE = '8e8a594f-2175-38c7-a871-abb68ec363e7';
const NEVERMIND = '1b022e01-4da6-387b-8658-8678046e4cef';
const THRILLER = '8d6bbb0c-8a0a-3b3b-9a6e-1f1c7d7d2c11';
const CATALOGUE: Record<string, { title: string; artist: string; date: string }> = {
  [BLUE]: { title: 'Kind of Blue', artist: 'Miles Davis', date: '1959-08-17' },
  [NEVERMIND]: { title: 'Nevermind', artist: 'Nirvana', date: '1991-09-24' },
  [THRILLER]: { title: 'Thriller', artist: 'Michael Jackson', date: '1982-11-30' },
};

let server: Server;
let baseUrl: string;
let musicBrainzDown: boolean;

beforeEach(async () => {
  musicBrainzDown = false;
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (path: string) => {
    if (musicBrainzDown) return { ok: false, status: 503 } as Response;
    const id = path.match(/^release-group\/([0-9a-f-]{36})/)?.[1] ?? '';
    const known = CATALOGUE[id];
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

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function newDeviceToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/devices`, { method: 'POST' });
  return ((await res.json()) as { token: string }).token;
}

function send(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const TOP = { kind: 'top', qualifier: 'all-time' };

async function makeList(token: string, releaseGroupIds: string[]): Promise<{ id: string }> {
  const res = await send('POST', '/lists', token, { ...TOP, releaseGroupIds });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe('lists through the real API', () => {
  it('makes a list, with each album named as MusicBrainz names it', async () => {
    const token = await newDeviceToken();

    const res = await send('POST', '/lists', token, { ...TOP, releaseGroupIds: [NEVERMIND, BLUE] });
    const list = (await res.json()) as {
      id: string;
      title: string;
      isOwner: boolean;
      albums: { slug: string; album: string; artist: string; year: string }[];
    };

    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(list.title).toBe('My top 3 albums of all time');
    expect(list.isOwner).toBe(true);
    expect(list.albums.map((a) => [a.artist, a.album, a.year, a.slug])).toEqual([
      ['Nirvana', 'Nevermind', '1991', 'nirvana-nevermind'],
      ['Miles Davis', 'Kind of Blue', '1959', 'miles-davis-kind-of-blue'],
    ]);
  });

  it('shows the list to anyone with its code, and only the owner may change it', async () => {
    const owner = await newDeviceToken();
    const stranger = await newDeviceToken();
    const { id } = await makeList(owner, [BLUE, NEVERMIND, THRILLER]);

    const asVisitor = await send('GET', `/lists/${id}`, null);
    const asOwner = await send('GET', `/lists/${id}`, owner);
    const asStranger = await send('GET', `/lists/${id}`, stranger);

    expect(asVisitor.status).toBe(200);
    expect(((await asVisitor.json()) as { isOwner: boolean }).isOwner).toBe(false);
    expect(((await asOwner.json()) as { isOwner: boolean }).isOwner).toBe(true);
    expect(((await asStranger.json()) as { isOwner: boolean }).isOwner).toBe(false);
  });

  it('lists the caller’s own lists, and none for someone with no token', async () => {
    const token = await newDeviceToken();
    await makeList(token, [BLUE]);

    const mine = (await (await send('GET', '/lists', token)).json()) as { lists: unknown[] };
    const anonymous = (await (await send('GET', '/lists', null)).json()) as { lists: unknown[] };

    expect(mine.lists).toHaveLength(1);
    expect(anonymous.lists).toEqual([]);
  });

  it('changes the albums and their order, keeping the same code', async () => {
    const token = await newDeviceToken();
    const { id } = await makeList(token, [BLUE]);
    // Not shared until it is full, so only its owner can read it yet.
    expect((await send('GET', `/lists/${id}`, null)).status).toBe(404);
    expect((await send('GET', `/lists/${id}`, token)).status).toBe(200);

    const res = await send('PUT', `/lists/${id}`, token, { releaseGroupIds: [NEVERMIND, BLUE] });
    const list = (await res.json()) as { id: string; albums: { album: string }[] };

    expect(res.status).toBe(200);
    expect(list.id).toBe(id);
    expect(list.albums.map((a) => a.album)).toEqual(['Nevermind', 'Kind of Blue']);
  });

  it('answers 404, as for a list that is not there, when someone else tries to change or remove it', async () => {
    const owner = await newDeviceToken();
    const stranger = await newDeviceToken();
    const { id } = await makeList(owner, [BLUE, NEVERMIND, THRILLER]);

    expect((await send('PUT', `/lists/${id}`, stranger, { releaseGroupIds: [] })).status).toBe(404);
    expect((await send('DELETE', `/lists/${id}`, stranger)).status).toBe(404);
    expect((await send('PUT', `/lists/${id}`, null, { releaseGroupIds: [] })).status).toBe(404);
    expect((await send('GET', `/lists/${id}`, null)).status).toBe(200);
  });

  it('removes a list, so its code shows nothing', async () => {
    const token = await newDeviceToken();
    const { id } = await makeList(token, []);

    expect((await send('DELETE', `/lists/${id}`, token)).status).toBe(204);
    expect((await send('GET', `/lists/${id}`, null)).status).toBe(404);
  });

  it('answers 409 to a second list of the same kind', async () => {
    const token = await newDeviceToken();
    await makeList(token, []);

    const res = await send('POST', '/lists', token, { ...TOP, releaseGroupIds: [] });

    expect(res.status).toBe(409);
  });

  it('answers 403, not 401, when there is no device to own the list', async () => {
    const res = await send('POST', '/lists', null, { ...TOP, releaseGroupIds: [] });

    expect(res.status).toBe(403);
  });

  it('answers 422 for an album MusicBrainz does not know, and keeps nothing', async () => {
    const token = await newDeviceToken();

    const res = await send('POST', '/lists', token, {
      ...TOP,
      releaseGroupIds: ['00000000-0000-4000-8000-000000000000'],
    });

    expect(res.status).toBe(422);
    expect(((await (await send('GET', '/lists', token)).json()) as { lists: [] }).lists).toEqual(
      [],
    );
  });

  it('answers 503 when MusicBrainz cannot be asked', async () => {
    const token = await newDeviceToken();
    musicBrainzDown = true;

    const res = await send('POST', '/lists', token, { ...TOP, releaseGroupIds: [BLUE] });

    expect(res.status).toBe(503);
  });

  it.each([
    ['too many albums', { ...TOP, releaseGroupIds: [BLUE, NEVERMIND, BLUE, NEVERMIND] }],
    ['an unknown kind', { kind: 'bottom', qualifier: 'all-time', releaseGroupIds: [] }],
    ['an album id that is not an id', { ...TOP, releaseGroupIds: ['kind-of-blue'] }],
  ])('answers 400 for %s', async (_name, body) => {
    const token = await newDeviceToken();

    expect((await send('POST', '/lists', token, body)).status).toBe(400);
  });

  it('answers 404 for a code that could not be a list', async () => {
    expect((await send('GET', '/lists/not-a-code', null)).status).toBe(404);
  });
});
