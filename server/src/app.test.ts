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
  router.get('/whoami', (req, res) => {
    res.json({ ip: req.ip });
  });
  return { createApiRouter: (): typeof router => router };
});

import { createApp } from './app';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { AlbumRepository } from './repositories/albumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { inMemoryAuth } from './testing/inMemoryAuth';
import { generousDailyLimit } from './testing/generousDailyLimit';

const TEMPLATE =
  '<html><head><title>Plinth</title></head><body><div id="root"></div></body></html>';

let server: Server;
let baseUrl: string;
let albums: AlbumRepository;

async function start(indexTemplate: string | null, trustProxyHops?: number): Promise<void> {
  albums = createInMemoryAlbumRepository();
  server = createApp({
    albums,
    devices: createInMemoryDeviceRepository(),
    dailyLimit: generousDailyLimit(),
    ...inMemoryAuth(),
    indexTemplate,
    trustProxyHops,
  }).listen(0);
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

describe('createApp list pages', () => {
  it('serves /list/:id from its own handler, not the app’s catch-all, when the client is built', async () => {
    const res = await fetch(`${baseUrl}/list/abcdefghjk`);

    // No such list, so 404 with the app: the catch-all would have said 200.
    expect(res.status).toBe(404);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toContain('<div id="root"></div>');
  });

  it('adds no list route when there is no build, as in development', async () => {
    await stop();
    await start(null);

    const res = await fetch(`${baseUrl}/list/abcdefghjk`);

    expect(res.headers.get('x-robots-tag')).toBeNull();
    await stop();
    await start(TEMPLATE);
  });
});

describe('createApp proxy trust', () => {
  interface Running {
    readonly server: Server;
    readonly baseUrl: string;
  }

  // One server per setting, started once: restarting a server for every assertion is slow, and
  // slower still when other tests are running.
  const running = new Map<number | undefined, Running>();

  beforeAll(async () => {
    for (const hops of [undefined, 0, 1, 2]) {
      const instance = createApp({
        albums: createInMemoryAlbumRepository(),
        devices: createInMemoryDeviceRepository(),
        dailyLimit: generousDailyLimit(),
        ...inMemoryAuth(),
        indexTemplate: TEMPLATE,
        trustProxyHops: hops,
      }).listen(0);
      await new Promise<void>((resolve) => instance.once('listening', () => resolve()));
      running.set(hops, {
        server: instance,
        baseUrl: `http://127.0.0.1:${(instance.address() as AddressInfo).port}`,
      });
    }
  });

  afterAll(async () => {
    await Promise.all(
      [...running.values()].map(
        ({ server: instance }) => new Promise<void>((resolve) => instance.close(() => resolve())),
      ),
    );
  });

  async function addressSeenWith(forwardedFor: string, hops?: number): Promise<string> {
    const instance = running.get(hops);
    if (!instance) throw new Error(`no server for ${String(hops)}`);
    const res = await fetch(`${instance.baseUrl}/api/v1/whoami`, {
      headers: { 'x-forwarded-for': forwardedFor },
    });
    return ((await res.json()) as { ip: string }).ip;
  }

  it('sees the visitor’s own address behind one trusted proxy', async () => {
    expect(await addressSeenWith('203.0.113.9', 1)).toBe('203.0.113.9');
  });

  it('ignores addresses a visitor adds to the left of the proxy’s, so a limit can’t be dodged', async () => {
    expect(await addressSeenWith('6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
  });

  it('counts the right number of proxies', async () => {
    expect(await addressSeenWith('6.6.6.6, 203.0.113.9, 198.51.100.4', 2)).toBe('203.0.113.9');
  });

  it('ignores the header when no proxy is trusted', async () => {
    expect(await addressSeenWith('203.0.113.9', 0)).toMatch(/127\.0\.0\.1$/);
    expect(await addressSeenWith('203.0.113.9')).toMatch(/127\.0\.0\.1$/);
  });
});
