import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import jpeg from 'jpeg-js';
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

// The real routes and middleware and the real renderer, with only MusicBrainz and the cover lookup
// replaced. No cover is found for any album, so the picture is drawn with placeholders.
const mockFetch = vi.mocked(musicBrainzFetch);

const TEMPLATE =
  '<html><head><title>Plinth</title></head><body><div id="root"></div></body></html>';
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

beforeEach(async () => {
  process.env.PUBLIC_URL = 'https://plinth.example';
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
    indexTemplate: TEMPLATE,
    trustProxyHops: 0,
  }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  delete process.env.PUBLIC_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function makeList(releaseGroupIds: string[]): Promise<string> {
  const token = (
    (await (await fetch(`${baseUrl}/api/v1/devices`, { method: 'POST' })).json()) as {
      token: string;
    }
  ).token;
  const res = await fetch(`${baseUrl}/api/v1/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: 'top', qualifier: 'all-time', releaseGroupIds }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe('list picture through the real API', () => {
  it('is at the address the page’s preview names, and is a 1200 by 630 JPEG', async () => {
    const id = await makeList(IDS);
    const html = await (await fetch(`${baseUrl}/list/${id}`)).text();
    const image = html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? '';

    expect(image).toMatch(
      new RegExp(`^https://plinth.example/api/v1/lists/${id}/image\\?v=[0-9a-f]{12}$`),
    );
    const res = await fetch(`${baseUrl}${image.replace('https://plinth.example', '')}`);
    const picture = Buffer.from(await res.arrayBuffer());
    const { width, height } = jpeg.decode(picture);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect([width, height]).toEqual([1200, 630]);
  });

  it('is sent to the current address when asked for with no hash', async () => {
    const id = await makeList(IDS);

    const res = await fetch(`${baseUrl}/api/v1/lists/${id}/image`, { redirect: 'manual' });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(
      new RegExp(`^/api/v1/lists/${id}/image\\?v=[0-9a-f]{12}$`),
    );
  });

  it('is not there for a list that does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lists/zzzzzzzzzz/image`);

    expect(res.status).toBe(404);
  });

  it('is not there for a list that is not finished, so a half-made list has no card', async () => {
    const id = await makeList(IDS.slice(0, 2));

    const res = await fetch(`${baseUrl}/api/v1/lists/${id}/image`);

    expect(res.status).toBe(404);
  });
});
