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
import { logger } from './logger';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { musicBrainzFetch } from './repositories/musicBrainzClient';
import { inMemoryAuth } from './testing/inMemoryAuth';
import { generousDailyLimit } from './testing/generousDailyLimit';

// The real routes and middleware, with only MusicBrainz and the cover lookup replaced and the
// logger watched. The lists routes limit writes per address, shared by every test in this file.
const mockFetch = vi.mocked(musicBrainzFetch);

const IDS = [
  '1b022e01-4da6-387b-8658-8678046e4cef',
  '9162580e-5df4-32de-80cc-f45a8d8a9b1d',
  '8e8a594f-2175-38c7-a871-abb68ec363e7',
];
const CATALOGUE: Record<string, { title: string; artist: string }> = {
  [IDS[0]]: { title: 'Nevermind', artist: 'Nirvana' },
  [IDS[1]]: { title: 'Abbey Road', artist: 'The Beatles' },
  [IDS[2]]: { title: 'Kind of Blue', artist: 'Miles Davis' },
};

let server: Server;
let baseUrl: string;
let info: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(async () => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (path: string) => {
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
        'first-release-date': '1990-01-01',
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
  info = vi.spyOn(logger, 'info');
});

afterEach(async () => {
  info.mockRestore();
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

async function makeList(token: string, releaseGroupIds: string[]): Promise<string> {
  const res = await send('POST', '/lists', token, {
    kind: 'top',
    qualifier: 'all-time',
    releaseGroupIds,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** What was logged under this message, as the fields alone. */
function logged(message: string): unknown[] {
  return info.mock.calls.filter(([, text]) => text === message).map(([fields]) => fields);
}

describe('logging lists', () => {
  it('logs a list being made, with how many albums it has and whether it is full', async () => {
    const token = await newDeviceToken();

    await makeList(token, IDS.slice(0, 2));
    await makeList(await newDeviceToken(), IDS);

    expect(logged('list created')).toEqual([
      { kind: 'top', qualifier: 'all-time', albumCount: 2, isFull: false },
      { kind: 'top', qualifier: 'all-time', albumCount: 3, isFull: true },
    ]);
  });

  it('logs a list being changed', async () => {
    const token = await newDeviceToken();
    const id = await makeList(token, IDS.slice(0, 2));

    await send('PUT', `/lists/${id}`, token, { releaseGroupIds: IDS });

    expect(logged('list edited')).toEqual([
      { kind: 'top', qualifier: 'all-time', albumCount: 3, isFull: true },
    ]);
  });

  it('logs a list being deleted', async () => {
    const token = await newDeviceToken();
    const id = await makeList(token, IDS);

    await send('DELETE', `/lists/${id}`, token);

    expect(logged('list deleted')).toEqual([{}]);
  });

  it('logs nothing for a change that was turned away', async () => {
    const token = await newDeviceToken();
    const id = await makeList(token, IDS);

    await send('PUT', `/lists/${id}`, await newDeviceToken(), { releaseGroupIds: [] });
    await send('PUT', `/lists/${id}`, token, { releaseGroupIds: ['not-an-id'] });
    await send('DELETE', `/lists/${id}`, await newDeviceToken());

    expect(logged('list edited')).toEqual([]);
    expect(logged('list deleted')).toEqual([]);
  });

  it('never writes which list it was, or whose', async () => {
    const token = await newDeviceToken();
    const id = await makeList(token, IDS);
    await send('PUT', `/lists/${id}`, token, { releaseGroupIds: IDS });
    await send('POST', `/lists/${id}/shared`, token);
    await send('DELETE', `/lists/${id}`, token);

    const everything = JSON.stringify(info.mock.calls);

    expect(everything).not.toContain(id);
    expect(everything).not.toContain(token);
  });
});

describe('noting that a list was shared', () => {
  it('logs it as the owner’s when the owner shares', async () => {
    const token = await newDeviceToken();
    const id = await makeList(token, IDS);

    const res = await send('POST', `/lists/${id}/shared`, token);

    expect(res.status).toBe(204);
    expect(logged('list shared')).toEqual([{ isOwner: true, qualifier: 'all-time' }]);
  });

  it('logs it as not the owner’s when a visitor passes a list on', async () => {
    const id = await makeList(await newDeviceToken(), IDS);

    const res = await send('POST', `/lists/${id}/shared`, null);

    expect(res.status).toBe(204);
    expect(logged('list shared')).toEqual([{ isOwner: false, qualifier: 'all-time' }]);
  });

  it('answers 404, and logs nothing, for a list that does not exist or could not be shared', async () => {
    const token = await newDeviceToken();
    const unfinished = await makeList(token, IDS.slice(0, 2));

    const unknown = await send('POST', '/lists/zzzzzzzzzz/shared', null);
    const notACode = await send('POST', '/lists/not-a-code/shared', null);
    const notFinishedForAStranger = await send('POST', `/lists/${unfinished}/shared`, null);

    expect([unknown.status, notACode.status, notFinishedForAStranger.status]).toEqual([
      404, 404, 404,
    ]);
    expect(logged('list shared')).toEqual([]);
  });
});
