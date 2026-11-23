import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import express from 'express';

vi.mock('../services/artworkService', () => ({
  fetchArtwork: vi.fn(async () => ({ artworkUrl: null, appleMusicUrl: null })),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../logger';
import { AlbumRepository } from '../repositories/albumRepository';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { createInMemoryListRepository } from '../repositories/inMemoryListRepository';
import { ListRepository } from '../repositories/listRepository';
import { ListImageContent } from '../services/listImageService';
import { createListImageHandler } from './listImageController';

const ALBUMS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', artist: 'Nirvana', album: 'Nevermind' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', artist: 'The Beatles', album: 'Abbey Road' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', artist: 'Miles Davis', album: 'Kind of Blue' },
];
const COVER = (n: number): string => `https://coverartarchive.org/cover-${n}.jpg`;
const LIST_ID = 'abcdefghjk';
const PICTURE = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);

let albums: AlbumRepository;
let lists: ListRepository;
let server: Server;
let baseUrl: string;
const render = vi.fn<[ListImageContent], Promise<Buffer>>();
const fetchCover = vi.fn<[string], Promise<{ buffer: Buffer; contentType: string }>>();

async function storeList(
  options: { covers?: (string | null)[]; albumCount?: number } = {},
): Promise<void> {
  const covers = options.covers ?? [COVER(1), COVER(2), COVER(3)];
  albums = createInMemoryAlbumRepository();
  lists = createInMemoryListRepository();
  for (const [index, { id, artist, album }] of ALBUMS.entries()) {
    await albums.insert({
      releaseGroupId: id,
      slug: `slug-${index}`,
      artist,
      album,
      year: '1990',
      hook: null,
      genres: [],
      country: null,
    });
    await albums.updateArtwork(id, {
      artworkUrl: covers[index] ?? null,
      appleMusicUrl: null,
      checkedAt: new Date(),
    });
  }
  await lists.create({
    id: LIST_ID,
    owner: { kind: 'device', id: 'device-1' },
    kind: 'top',
    qualifier: 'all-time',
    size: 3,
    releaseGroupIds: ALBUMS.slice(0, options.albumCount ?? 3).map((a) => a.id),
    now: new Date(),
  });
}

async function start(maxCachedImages?: number): Promise<void> {
  const app = express();
  app.get(
    '/lists/:id/image',
    createListImageHandler({
      lists,
      albums,
      renderImage: render,
      fetchCover,
      maxCachedImages,
    }),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The address of a list's picture as it is now, found by following the redirect. */
async function currentAddress(id = LIST_ID): Promise<string> {
  const res = await fetch(`${baseUrl}/lists/${id}/image`, { redirect: 'manual' });
  return res.headers.get('location') ?? '';
}

async function currentImage(): Promise<Response> {
  return fetch(`${baseUrl}${await currentAddress()}`);
}

beforeAll(() => {
  process.env.PUBLIC_URL = 'https://plinth.example';
});

beforeEach(async () => {
  vi.clearAllMocks();
  render.mockResolvedValue(PICTURE);
  fetchCover.mockImplementation(async (url) => ({
    buffer: Buffer.from(url),
    contentType: 'image/jpeg',
  }));
  await storeList();
  await start();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(() => {
  delete process.env.PUBLIC_URL;
});

describe('list image', () => {
  it('serves the picture as a JPEG that may be kept for a year, at the address with the right hash', async () => {
    const res = await currentImage();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await res.arrayBuffer()).equals(PICTURE)).toBe(true);
  });

  it('can be shown by other sites, which is how a link preview is built', async () => {
    const res = await currentImage();

    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('draws the list’s title and each album’s cover, in order', async () => {
    await currentImage();

    const content = render.mock.calls[0][0];
    expect(content.title).toBe('My top 3 albums of all time');
    expect(content.covers.map((cover) => cover?.bytes.toString())).toEqual([
      COVER(1),
      COVER(2),
      COVER(3),
    ]);
    expect(content.covers[0]?.contentType).toBe('image/jpeg');
  });

  it('asks for no cover where an album has none, and draws a placeholder for it', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await storeList({ covers: [COVER(1), null, COVER(3)] });
    await start();

    await currentImage();

    expect(fetchCover).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[0][0].covers[1]).toBeNull();
  });

  it('draws a placeholder for a cover that could not be fetched, and says so', async () => {
    fetchCover.mockImplementation(async (url) => {
      if (url === COVER(2)) throw new Error('Image fetch failed with status 404');
      return { buffer: Buffer.from(url), contentType: 'image/jpeg' };
    });

    const res = await currentImage();

    expect(res.status).toBe(200);
    expect(render.mock.calls[0][0].covers.map((c) => c !== null)).toEqual([true, false, true]);
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it('draws the picture once, however often it is asked for', async () => {
    const address = await currentAddress();

    await fetch(`${baseUrl}${address}`);
    await fetch(`${baseUrl}${address}`);
    await fetch(`${baseUrl}${address}`);

    expect(render).toHaveBeenCalledTimes(1);
    expect(fetchCover).toHaveBeenCalledTimes(3);
  });

  it('draws it once when it is asked for several times at the same moment', async () => {
    let finish: (png: Buffer) => void = () => undefined;
    render.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const address = await currentAddress();

    const pending = Promise.all([1, 2, 3].map(() => fetch(`${baseUrl}${address}`)));
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    finish(PICTURE);
    const responses = await pending;

    expect(render).toHaveBeenCalledTimes(1);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  });

  it('keeps only the most recent pictures, so memory does not grow without end', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await storeList();
    await start(1);
    await lists.create({
      id: 'zzzzzzzzzz',
      owner: { kind: 'device', id: 'device-2' },
      kind: 'top',
      qualifier: 'all-time',
      size: 3,
      releaseGroupIds: [ALBUMS[2].id, ALBUMS[1].id, ALBUMS[0].id],
      now: new Date(),
    });
    const first = await currentAddress();
    const second = await currentAddress('zzzzzzzzzz');

    await fetch(`${baseUrl}${first}`);
    await fetch(`${baseUrl}${second}`);
    // The one place went to the second picture, so the first has to be drawn again.
    await fetch(`${baseUrl}${first}`);

    expect(render).toHaveBeenCalledTimes(3);
  });

  it('sends a request with no hash, or an old one, to the current address, which changes with the list', async () => {
    const current = await currentAddress();
    const stale = await fetch(`${baseUrl}/lists/${LIST_ID}/image?v=000000000000`, {
      redirect: 'manual',
    });

    expect(current).toMatch(new RegExp(`^/lists/${LIST_ID}/image\\?v=[0-9a-f]{12}$`));
    expect(stale.status).toBe(302);
    expect(stale.headers.get('location')).toBe(current);
    expect(stale.headers.get('cache-control')).toBe('no-store');
    expect(render).not.toHaveBeenCalled();
  });

  it('answers a list that was never made, or is not finished, 404', async () => {
    const unknown = await fetch(`${baseUrl}/lists/zzzzzzzzzz/image`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await storeList({ albumCount: 2 });
    await start();
    const unfinished = await fetch(`${baseUrl}/lists/${LIST_ID}/image`);

    expect(unknown.status).toBe(404);
    expect(unfinished.status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });

  it('answers something that could not be a code 404 without asking the database', async () => {
    const find = vi.spyOn(lists, 'findById');

    const res = await fetch(`${baseUrl}/lists/not-a-code/image`);

    expect(res.status).toBe(404);
    expect(find).not.toHaveBeenCalled();
  });

  it('falls back to the Plinth card, without keeping that answer, when the picture cannot be drawn', async () => {
    render.mockRejectedValue(new Error('the renderer is broken'));
    const address = await currentAddress();

    const res = await fetch(`${baseUrl}${address}`, { redirect: 'manual' });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/og-default.png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });

  it('tries again for the next request after a failure, rather than keeping it', async () => {
    render.mockRejectedValueOnce(new Error('out of memory')).mockResolvedValue(PICTURE);
    const address = await currentAddress();

    await fetch(`${baseUrl}${address}`, { redirect: 'manual' });
    const second = await fetch(`${baseUrl}${address}`);

    expect(second.status).toBe(200);
  });

  it('logs when a picture is drawn, with how long it took, and never which list it was for', async () => {
    await currentImage();

    const call = vi
      .mocked(logger.info)
      .mock.calls.find(([, message]) => message === 'list image drawn');
    expect(call).toBeDefined();
    expect(call?.[0]).toEqual({ covers: 3, drawMs: expect.any(Number) });
  });
});
