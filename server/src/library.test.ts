import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { LibraryItem, LibrarySyncResponse } from '@shared/types';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

import { createApp } from './app';
import { createInMemoryAccountRepository } from './repositories/inMemoryAccountRepository';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { createInMemoryLibraryRepository } from './repositories/inMemoryLibraryRepository';
import { createInMemorySignInLinkRepository } from './repositories/inMemorySignInLinkRepository';
import { AccountRepository } from './repositories/accountRepository';
import { LibraryRepository } from './repositories/libraryRepository';
import { generousDailyLimit } from './testing/generousDailyLimit';
import { EmailMessage } from './services/emailSender';

// The real routes and middleware. The library routes limit requests by address and those limits
// outlive a test, so each test comes from an address of its own, as if behind a proxy.
let server: Server;
let baseUrl: string;
let sent: EmailMessage[];
let library: LibraryRepository;
let accounts: AccountRepository;
let clientAddress: string;
let testNumber = 0;

async function start(): Promise<void> {
  sent = [];
  library = createInMemoryLibraryRepository();
  accounts = createInMemoryAccountRepository();
  server = createApp({
    albums: createInMemoryAlbumRepository(),
    devices: createInMemoryDeviceRepository(),
    accounts,
    signInLinks: createInMemorySignInLinkRepository(),
    library,
    signInChannel: {
      sender: {
        send: async (message): Promise<void> => {
          sent.push(message);
        },
      },
      baseUrl: 'https://plinth.example',
    },
    dailyLimit: generousDailyLimit(),
    trustProxyHops: 1,
  }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  testNumber += 1;
  clientAddress = `198.51.100.${testNumber}`;
  await start();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'X-Forwarded-For': clientAddress,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function newDeviceToken(): Promise<string> {
  return ((await (await call('POST', '/devices')).json()) as { token: string }).token;
}

async function signInDevice(email: string): Promise<string> {
  const token = await newDeviceToken();
  expect((await call('POST', '/auth/sign-in', { body: { email } })).status).toBe(202);
  const link = sent[sent.length - 1].text.match(/#token=(\S+)/)?.[1] as string;
  const res = await call('POST', '/auth/verify', { token, body: { token: link } });
  expect(res.status).toBe(200);
  return token;
}

function album(name: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    recommendation: { artist: 'Can', album: name, year: '1971', reason: 'A great fit.' },
    artwork: { artworkUrl: null, year: null, appleMusicUrl: null },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

async function sync(
  token: string,
  body: { since?: string | null; items?: LibraryItem[]; deletions?: { key: string; at: string }[] },
): Promise<LibrarySyncResponse> {
  const res = await call('POST', '/library/sync', { token, body });
  expect(res.status).toBe(200);
  return (await res.json()) as LibrarySyncResponse;
}

describe('a large crate through the real API', () => {
  it('reaches a new device a page at a time, every album once', async () => {
    const phone = await signInDevice('person@example.com');
    const laptop = await signInDevice('person@example.com');
    for (let batch = 0; batch < 11; batch += 1) {
      // Rated, since unrated picks are cut back to the newest few.
      const items = Array.from({ length: 100 }, (_, index) =>
        album(`Album ${batch * 100 + index}`, {
          feedback: { status: 'own', at: new Date().toISOString() },
        }),
      );
      await sync(phone, { items });
    }

    const seen: string[] = [];
    let since: string | null = null;
    let rounds = 0;
    let more = true;
    while (more) {
      const response: LibrarySyncResponse = await sync(laptop, { since });
      seen.push(...response.items.map((item) => item.recommendation.album));
      since = response.cursor;
      more = response.more === true;
      rounds += 1;
    }

    expect(rounds).toBeGreaterThan(1);
    expect(seen).toHaveLength(1100);
    expect(new Set(seen).size).toBe(1100);
  });
});

describe('saving a crate through the real API', () => {
  it('saves albums for an account and returns them to another device signed in to it', async () => {
    const phone = await signInDevice('person@example.com');
    const laptop = await signInDevice('person@example.com');

    await sync(phone, { items: [album('Tago Mago'), album('Ege Bamyasi')] });
    const onLaptop = await sync(laptop, { since: null });

    expect(onLaptop.items.map((item) => item.recommendation.album).sort()).toEqual([
      'Ege Bamyasi',
      'Tago Mago',
    ]);
  });

  it('carries a verdict and a removal from one device to the other', async () => {
    const phone = await signInDevice('person@example.com');
    const laptop = await signInDevice('person@example.com');
    const first = await sync(phone, { items: [album('Tago Mago'), album('Ege Bamyasi')] });

    await sync(phone, {
      items: [album('Tago Mago', { feedback: { status: 'own', at: new Date().toISOString() } })],
      deletions: [{ key: 'can|ege bamyasi', at: new Date().toISOString() }],
    });
    const onLaptop = await sync(laptop, { since: first.cursor });

    expect(onLaptop.items).toEqual([
      expect.objectContaining({ feedback: expect.objectContaining({ status: 'own' }) }),
    ]);
    expect(onLaptop.deletions).toEqual([expect.objectContaining({ key: 'can|ege bamyasi' })]);
  });

  it('answers a repeated request the same way and changes nothing', async () => {
    const token = await signInDevice('person@example.com');
    const body = { items: [album('Tago Mago')] };

    const first = await sync(token, body);
    const again = await sync(token, body);

    expect(again.items).toEqual(first.items);
  });

  it('keeps one account’s crate from another’s', async () => {
    const mine = await signInDevice('me@example.com');
    const theirs = await signInDevice('them@example.com');
    await sync(mine, { items: [album('Tago Mago')] });

    expect((await sync(theirs, { since: null })).items).toEqual([]);
  });

  it('is refused for a device that is not signed in, with a 403 and not a 401', async () => {
    const token = await newDeviceToken();

    const res = await call('POST', '/library/sync', { token, body: { items: [] } });

    expect(res.status).toBe(403);
  });

  it('is refused with no device at all', async () => {
    const res = await call('POST', '/library/sync', { body: { items: [] } });

    expect(res.status).toBe(403);
  });

  it('refuses a request that is not valid', async () => {
    const token = await signInDevice('person@example.com');

    const res = await call('POST', '/library/sync', {
      token,
      body: { items: [{ recommendation: {} }] },
    });

    expect(res.status).toBe(400);
  });

  it('is not cached', async () => {
    const token = await signInDevice('person@example.com');

    const res = await call('POST', '/library/sync', { token, body: { items: [] } });

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('stops a device being signed out from reading the crate it left behind', async () => {
    const token = await signInDevice('person@example.com');
    await sync(token, { items: [album('Tago Mago')] });

    await call('POST', '/auth/sign-out', { token });

    expect((await call('POST', '/library/sync', { token, body: {} })).status).toBe(403);
  });

  it('removes the crate when the account is deleted', async () => {
    const token = await signInDevice('person@example.com');
    await sync(token, { items: [album('Tago Mago')] });
    const { account } = await accounts.findOrCreateByEmail('person@example.com', new Date());

    expect((await call('DELETE', '/auth/account', { token })).status).toBe(204);

    const left = await library.sync(account.id, {
      items: [],
      deletions: [],
      since: null,
      now: new Date(),
      maxRecords: 1_000,
    });
    expect(left).toEqual([]);
  });

  it('starts an account that is made again with an empty crate', async () => {
    const first = await signInDevice('person@example.com');
    await sync(first, { items: [album('Tago Mago')] });
    await call('DELETE', '/auth/account', { token: first });

    const again = await signInDevice('person@example.com');

    expect((await sync(again, { since: null })).items).toEqual([]);
  });
});
