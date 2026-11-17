import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

vi.mock('./routes/api', async () => {
  const { Router } = await import('express');
  const router = Router();
  router.get('/ping', (_req, res) => {
    res.json({ pong: true });
  });
  return { createApiRouter: (): typeof router => router };
});

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { AlbumRepository } from './repositories/albumRepository';

const TEMPLATE =
  '<html><head><title>Plinth</title></head><body><div id="root"></div></body></html>';

let server: Server;
let baseUrl: string;
let albums: AlbumRepository;

async function start(indexTemplate: string | null): Promise<void> {
  albums = createInMemoryAlbumRepository();
  server = createApp({ albums, indexTemplate }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function stop(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

beforeAll(() => start(TEMPLATE));

afterAll(stop);

describe('createApp routing', () => {
  it('serves the API under /api/v1', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ping`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it('keeps the health check unversioned for the Railway health check', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('no longer serves the API at its unversioned path', async () => {
    const res = await fetch(`${baseUrl}/api/ping`);

    expect(res.status).toBe(404);
  });

  it('answers unknown API paths with a JSON 404 rather than the web app', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nope`);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});

describe('createApp album pages', () => {
  it('serves /album/:slug with link preview tags when the client is built', async () => {
    await albums.insert({
      releaseGroupId: 'ae0f7b78-3dce-3157-8dd5-a82251dcf8ef',
      slug: 'the-sound-jeopardy',
      artist: 'The Sound',
      album: 'Jeopardy',
      year: '1980',
      hook: 'A tightly coiled record.',
      genres: [],
      country: null,
    });
    await albums.updateArtwork('ae0f7b78-3dce-3157-8dd5-a82251dcf8ef', {
      artworkUrl: null,
      appleMusicUrl: null,
      checkedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/album/the-sound-jeopardy`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>Jeopardy by The Sound · Plinth</title>');
    expect(html).toContain('property="og:description" content="A tightly coiled record."');
  });

  it('answers an unknown album 404 with the app and default tags', async () => {
    const res = await fetch(`${baseUrl}/album/no-such-album`);

    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<div id="root"></div>');
  });

  it('adds no album route when there is no build, as in development', async () => {
    await stop();
    await start(null);

    const res = await fetch(`${baseUrl}/album/the-sound-jeopardy`);

    expect(await res.text()).not.toContain('og:title');
    await stop();
    await start(TEMPLATE);
  });
});
