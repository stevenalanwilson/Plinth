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
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { createInMemoryListRepository } from '../repositories/inMemoryListRepository';
import { ListRepository } from '../repositories/listRepository';
import { createListPageHandler } from './listPageController';

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Plinth</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const ALBUMS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', artist: 'Nirvana', album: 'Nevermind' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', artist: 'The Beatles', album: 'Abbey Road' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', artist: 'Miles Davis', album: 'Kind of Blue' },
];
const LIST_ID = 'abcdefghjk';

let lists: ListRepository;
let server: Server;
let baseUrl: string;

async function storeList(albumCount = 3, id = LIST_ID): Promise<void> {
  const albums = createInMemoryAlbumRepository();
  lists = createInMemoryListRepository();
  for (const { id: releaseGroupId, artist, album } of ALBUMS) {
    await albums.insert({
      releaseGroupId,
      slug: album.toLowerCase().replace(/ /g, '-'),
      artist,
      album,
      year: '1990',
      hook: null,
      genres: [],
      country: null,
    });
  }
  await lists.create({
    id,
    owner: { kind: 'device', id: 'device-1' },
    kind: 'top',
    qualifier: 'all-time',
    size: 3,
    releaseGroupIds: ALBUMS.slice(0, albumCount).map((a) => a.id),
    now: new Date(),
  });
  await start(albums);
}

async function start(albums = createInMemoryAlbumRepository()): Promise<void> {
  const app = express();
  app.get('/list/:id', createListPageHandler({ lists, albums, template: TEMPLATE }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(() => {
  process.env.PUBLIC_URL = 'https://plinth.example';
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(() => {
  delete process.env.PUBLIC_URL;
});

describe('list page', () => {
  it('serves the app with the list’s title, description and link in the head', async () => {
    await storeList();

    const res = await fetch(`${baseUrl}/list/${LIST_ID}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>My top 3 albums of all time · Plinth</title>');
    expect(html).toContain(
      'property="og:description" content="Nevermind by Nirvana, Abbey Road by The Beatles and Kind of Blue by Miles Davis."',
    );
    expect(html).toContain(`property="og:url" content="https://plinth.example/list/${LIST_ID}"`);
    expect(html).toContain('<div id="root"></div>');
  });

  it('points the preview at the list’s own picture', async () => {
    await storeList();

    const html = await (await fetch(`${baseUrl}/list/${LIST_ID}`)).text();

    expect(html).toMatch(
      new RegExp(
        `property="og:image" content="https://plinth.example/api/v1/lists/${LIST_ID}/image\\?v=[0-9a-f]{12}"`,
      ),
    );
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('asks search engines to leave it out, in the page and in the headers', async () => {
    await storeList();

    const res = await fetch(`${baseUrl}/list/${LIST_ID}`);

    expect(await res.text()).toContain('<meta name="robots" content="noindex" />');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('answers a code that was never made 404, with the app and the default card', async () => {
    await storeList();

    const res = await fetch(`${baseUrl}/list/zzzzzzzzzz`);
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('og-default.png');
    expect(html).not.toContain('My top 3');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('answers something that could not be a code 404 without asking the database', async () => {
    await storeList();
    const find = vi.spyOn(lists, 'findById');

    const res = await fetch(`${baseUrl}/list/not-a-code`);

    expect(res.status).toBe(404);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers a list that is not finished 404, so a half-made list is never previewed', async () => {
    await storeList(2);

    const res = await fetch(`${baseUrl}/list/${LIST_ID}`);

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('Nevermind');
  });

  it('escapes the albums’ names, which are not trusted as markup', async () => {
    await storeList();
    const albums = createInMemoryAlbumRepository();
    await albums.insert({
      releaseGroupId: ALBUMS[0].id,
      slug: 'x',
      artist: 'A <script>alert(1)</script>',
      album: 'B "quoted"',
      year: null,
      hook: null,
      genres: [],
      country: null,
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start(albums);

    const html = await (await fetch(`${baseUrl}/list/${LIST_ID}`)).text();

    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('logs the view, saying whether it was a link preview, and never which list it was', async () => {
    await storeList();

    await fetch(`${baseUrl}/list/${LIST_ID}`, { headers: { 'user-agent': 'WhatsApp/2.23' } });
    await fetch(`${baseUrl}/list/${LIST_ID}`, { headers: { 'user-agent': 'Mozilla/5.0 Safari' } });

    expect(vi.mocked(logger.info)).toHaveBeenNthCalledWith(
      1,
      { found: true, crawler: true },
      'list page served',
    );
    expect(vi.mocked(logger.info)).toHaveBeenNthCalledWith(
      2,
      { found: true, crawler: false },
      'list page served',
    );
  });

  it('still serves the app, with the default card, when the list cannot be read', async () => {
    await storeList();
    vi.spyOn(lists, 'findById').mockRejectedValue(new Error('database is down'));

    const res = await fetch(`${baseUrl}/list/${LIST_ID}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('og-default.png');
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});
