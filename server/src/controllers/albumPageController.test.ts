import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import express from 'express';

vi.mock('../services/artworkService', () => ({
  fetchArtwork: vi.fn(async () => {
    throw new Error('the album page must not look artwork up when it is already stored');
  }),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../logger';
import { AlbumRepository } from '../repositories/albumRepository';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { createAlbumPageHandler } from './albumPageController';

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Plinth</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const COVER = 'http://coverartarchive.org/release/x/1-500.jpg';

let albums: AlbumRepository;
let server: Server;
let baseUrl: string;

async function storeAlbum(
  overrides: { hook?: string | null; artworkUrl?: string | null } = {},
): Promise<void> {
  await albums.insert({
    releaseGroupId: 'ae0f7b78-3dce-3157-8dd5-a82251dcf8ef',
    slug: 'the-sound-jeopardy',
    artist: 'The Sound',
    album: 'Jeopardy',
    year: '1980',
    hook: overrides.hook === undefined ? 'A tightly coiled record.' : overrides.hook,
    genres: [],
    country: null,
  });
  await albums.updateArtwork('ae0f7b78-3dce-3157-8dd5-a82251dcf8ef', {
    artworkUrl: overrides.artworkUrl === undefined ? COVER : overrides.artworkUrl,
    appleMusicUrl: null,
    checkedAt: new Date(),
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.get('/album/:slug', createAlbumPageHandler({ albums, template: TEMPLATE }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(() => {
  process.env.PUBLIC_URL = 'https://plinth.example';
});

beforeEach(async () => {
  vi.clearAllMocks();
  albums = createInMemoryAlbumRepository();
  await startServer();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(() => {
  delete process.env.PUBLIC_URL;
});

describe('album page', () => {
  it('serves the web app with the album’s link preview tags', async () => {
    await storeAlbum();

    const res = await fetch(`${baseUrl}/album/the-sound-jeopardy`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(html).toContain('<title>Jeopardy by The Sound · Plinth</title>');
    expect(html).toContain('<meta property="og:title" content="Jeopardy by The Sound" />');
    expect(html).toContain('<meta property="og:description" content="A tightly coiled record." />');
    expect(html).toContain(
      '<meta property="og:url" content="https://plinth.example/album/the-sound-jeopardy" />',
    );
    expect(html).toContain(
      `<meta property="og:image" content="https://plinth.example/api/v1/image?url=${encodeURIComponent(COVER)}" />`,
    );
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain('<div id="root"></div>');
  });

  it('uses the Plinth card for an album with no cover', async () => {
    await storeAlbum({ artworkUrl: null });

    const html = await (await fetch(`${baseUrl}/album/the-sound-jeopardy`)).text();

    expect(html).toContain('content="https://plinth.example/og-default.png"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('describes an album with no hook by name, artist and year', async () => {
    await storeAlbum({ hook: null });

    const html = await (await fetch(`${baseUrl}/album/the-sound-jeopardy`)).text();

    expect(html).toContain('Jeopardy by The Sound (1980), a record picked on Plinth.');
  });

  it('answers an unknown album 404 with the web app and the default Plinth tags', async () => {
    const res = await fetch(`${baseUrl}/album/no-such-album`);
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<meta property="og:title" content="Plinth" />');
    expect(html).toContain('content="https://plinth.example/og-default.png"');
  });

  it('answers a malformed slug 404 the same way', async () => {
    const res = await fetch(`${baseUrl}/album/Bad%20Slug`);

    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<meta property="og:title" content="Plinth" />');
  });

  it('still serves the web app, with the default tags, when the lookup fails', async () => {
    albums.findBySlug = vi.fn().mockRejectedValue(new Error('connection refused'));

    const res = await fetch(`${baseUrl}/album/the-sound-jeopardy`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<meta property="og:title" content="Plinth" />');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'connection refused', slug: 'the-sound-jeopardy' }),
      'album page failed',
    );
  });

  it('escapes text from the album, so it cannot inject markup into the page', async () => {
    await storeAlbum({ hook: '"/><script>alert(1)</script>' });

    const html = await (await fetch(`${baseUrl}/album/the-sound-jeopardy`)).text();

    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  describe('the address in the tags', () => {
    it('ignores a trailing slash on PUBLIC_URL', async () => {
      process.env.PUBLIC_URL = 'https://plinth.example///';
      await storeAlbum();

      const html = await (await fetch(`${baseUrl}/album/the-sound-jeopardy`)).text();

      expect(html).toContain('content="https://plinth.example/album/the-sound-jeopardy"');
      process.env.PUBLIC_URL = 'https://plinth.example';
    });

    it('falls back to the address the request came in on when PUBLIC_URL is not set', async () => {
      delete process.env.PUBLIC_URL;
      await storeAlbum();

      const html = await (await fetch(`${baseUrl}/album/the-sound-jeopardy`)).text();

      expect(html).toContain(`content="${baseUrl}/album/the-sound-jeopardy"`);
      process.env.PUBLIC_URL = 'https://plinth.example';
    });

    it('uses https behind a proxy that says the request was https', async () => {
      delete process.env.PUBLIC_URL;
      await storeAlbum();

      const html = await (
        await fetch(`${baseUrl}/album/the-sound-jeopardy`, {
          headers: { 'x-forwarded-proto': 'https' },
        })
      ).text();

      expect(html).toContain(`content="https://${new URL(baseUrl).host}/album/the-sound-jeopardy"`);
      process.env.PUBLIC_URL = 'https://plinth.example';
    });

    it('ignores any other forwarded protocol', async () => {
      delete process.env.PUBLIC_URL;
      await storeAlbum();

      const html = await (
        await fetch(`${baseUrl}/album/the-sound-jeopardy`, {
          headers: { 'x-forwarded-proto': 'javascript' },
        })
      ).text();

      expect(html).not.toContain('javascript://');
      expect(html).toContain(`content="${baseUrl}/album/the-sound-jeopardy"`);
      process.env.PUBLIC_URL = 'https://plinth.example';
    });
  });
});
