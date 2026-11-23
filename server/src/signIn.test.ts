import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressInfo } from 'net';
import { Server } from 'http';

vi.mock('./logger', async () => {
  const { default: pino } = await import('pino');
  return { logger: pino({ level: 'silent' }) };
});

vi.mock('./services/recommendationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/recommendationService')>()),
  getRecommendation: vi.fn(),
}));

import { createApp } from './app';
import { createInMemoryListRepository } from './repositories/inMemoryListRepository';
import { createInMemoryAccountRepository } from './repositories/inMemoryAccountRepository';
import { createInMemoryAlbumRepository } from './repositories/inMemoryAlbumRepository';
import { createInMemoryDeviceRepository } from './repositories/inMemoryDeviceRepository';
import { createInMemoryLibraryRepository } from './repositories/inMemoryLibraryRepository';
import { createInMemorySignInLinkRepository } from './repositories/inMemorySignInLinkRepository';
import { createInMemoryUsageRepository } from './repositories/inMemoryUsageRepository';
import { getRecommendation } from './services/recommendationService';
import { createDailyPickLimiter } from './services/dailyLimitService';
import { EmailMessage, EmailSender } from './services/emailSender';

// The real routes and middleware, with only the Claude call and the email service replaced. The
// routes limit requests by address and those limits outlive a test, so each test comes from an
// address of its own, as if behind a proxy.
const mockGetRecommendation = vi.mocked(getRecommendation);
const PICK = { artist: 'Can', album: 'Tago Mago', year: '1971', reason: 'A great fit.' };
const PICK_BODY = {
  preferences: {
    genres: [],
    moods: [],
    tempo: 5,
    energy: 5,
    density: 5,
    era: 'any',
    includeFamiliarArtists: true,
    prioritiseObscure: false,
    stayFocused: false,
  },
  alreadySuggested: [],
};

let server: Server;
let baseUrl: string;
let sent: EmailMessage[];
let clientAddress: string;
let testNumber = 0;

async function start(options: { sender?: EmailSender | null } = {}): Promise<void> {
  sent = [];
  const sender: EmailSender = options.sender ?? {
    send: async (message): Promise<void> => {
      sent.push(message);
    },
  };
  server = createApp({
    albums: createInMemoryAlbumRepository(),
    devices: createInMemoryDeviceRepository(),
    accounts: createInMemoryAccountRepository(),
    signInLinks: createInMemorySignInLinkRepository(),
    library: createInMemoryLibraryRepository(),
    lists: createInMemoryListRepository(),
    signInChannel: options.sender === null ? null : { sender, baseUrl: 'https://plinth.example' },
    dailyLimit: createDailyPickLimiter({
      usage: createInMemoryUsageRepository(),
      limits: { perVisitor: 1, perAccount: 3, global: 1000 },
    }),
    trustProxyHops: 1,
  }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  testNumber += 1;
  clientAddress = `203.0.113.${testNumber}`;
  mockGetRecommendation.mockReset();
  mockGetRecommendation.mockResolvedValue(PICK);
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

async function requestLink(email: string): Promise<string> {
  const res = await call('POST', '/auth/sign-in', { body: { email } });
  expect(res.status).toBe(202);
  const message = sent[sent.length - 1];
  return message.text.match(/#token=(\S+)/)?.[1] as string;
}

async function signInDevice(email: string): Promise<string> {
  const token = await newDeviceToken();
  const link = await requestLink(email);
  const res = await call('POST', '/auth/verify', { token, body: { token: link } });
  expect(res.status).toBe(200);
  return token;
}

async function whoAmI(token: string): Promise<string | null> {
  const body = (await (await call('GET', '/auth/me', { token })).json()) as {
    account: { email: string } | null;
  };
  return body.account?.email ?? null;
}

describe('signing in through the real API', () => {
  it('signs a device in with a link from an email, and out again', async () => {
    await start();
    const token = await newDeviceToken();
    expect(await whoAmI(token)).toBeNull();

    const link = await requestLink('Person@Example.com');
    const verified = await call('POST', '/auth/verify', { token, body: { token: link } });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ account: { email: 'person@example.com' } });
    expect(await whoAmI(token)).toBe('person@example.com');

    expect((await call('POST', '/auth/sign-out', { token })).status).toBe(204);
    expect(await whoAmI(token)).toBeNull();
  });

  it('sends the link to the address, and starts it from the public address', async () => {
    await start();

    await requestLink('person@example.com');

    expect(sent[0].to).toBe('person@example.com');
    expect(sent[0].text).toContain('https://plinth.example/signin#token=pls_');
  });

  it('works once only', async () => {
    await start();
    const link = await requestLink('person@example.com');
    const first = await newDeviceToken();
    const second = await newDeviceToken();

    expect(
      (await call('POST', '/auth/verify', { token: first, body: { token: link } })).status,
    ).toBe(200);
    const again = await call('POST', '/auth/verify', { token: second, body: { token: link } });

    expect(again.status).toBe(400);
    expect(((await again.json()) as { error: string }).error).toContain(
      'expired or has already been used',
    );
    expect(await whoAmI(second)).toBeNull();
  });

  it('says nothing about whether an address has an account', async () => {
    await start();
    await signInDevice('known@example.com');

    const known = await call('POST', '/auth/sign-in', { body: { email: 'known@example.com' } });
    const unknown = await call('POST', '/auth/sign-in', { body: { email: 'new@example.com' } });

    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it('refuses an address that is not one, and does not send an email', async () => {
    await start();

    const res = await call('POST', '/auth/sign-in', { body: { email: 'not an email' } });

    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('says sign-in is not available when it is not set up', async () => {
    await start({ sender: null });

    const res = await call('POST', '/auth/sign-in', { body: { email: 'person@example.com' } });

    expect(res.status).toBe(503);
  });

  it('says so when the email could not be sent', async () => {
    await start({ sender: { send: vi.fn().mockRejectedValue(new Error('Resend refused')) } });

    const res = await call('POST', '/auth/sign-in', { body: { email: 'person@example.com' } });

    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("couldn't send the email");
  });

  it('cannot sign in a browser that has no device token', async () => {
    await start();
    const link = await requestLink('person@example.com');

    const res = await call('POST', '/auth/verify', { body: { token: link } });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(
      'allows this site to store data',
    );
  });

  it('deletes the account, signing every device out and making the email new again', async () => {
    await start();
    const phone = await signInDevice('person@example.com');
    const laptopLink = await requestLink('person@example.com');
    const laptop = await newDeviceToken();
    await call('POST', '/auth/verify', { token: laptop, body: { token: laptopLink } });
    expect(await whoAmI(laptop)).toBe('person@example.com');

    const deleted = await call('DELETE', '/auth/account', { token: phone });

    expect(deleted.status).toBe(204);
    expect(await whoAmI(phone)).toBeNull();
    expect(await whoAmI(laptop)).toBeNull();
  });

  it('refuses to delete an account when not signed in, without calling it a stale token', async () => {
    await start();
    const token = await newDeviceToken();

    const res = await call('DELETE', '/auth/account', { token });

    expect(res.status).toBe(403);
  });

  it('says whether signing in is available, so a page can leave out offers to do it', async () => {
    await start();
    const available = await newDeviceToken();
    const withSignIn = await (await call('GET', '/auth/me', { token: available })).json();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await start({ sender: null });
    const unavailable = await newDeviceToken();
    const withoutSignIn = await (await call('GET', '/auth/me', { token: unavailable })).json();

    expect(withSignIn).toMatchObject({ account: null, signInAvailable: true });
    expect(withoutSignIn).toMatchObject({ account: null, signInAvailable: false });
  });

  it('keeps what is private out of caches', async () => {
    await start();
    const token = await newDeviceToken();

    const res = await call('GET', '/auth/me', { token });

    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('daily limits when signed in', () => {
  it('gives a signed-in account the higher limit, shared by all its devices', async () => {
    await start();
    const phone = await signInDevice('person@example.com');
    const laptopLink = await requestLink('person@example.com');
    const laptop = await newDeviceToken();
    await call('POST', '/auth/verify', { token: laptop, body: { token: laptopLink } });

    const statuses = [];
    for (const token of [phone, laptop, phone, laptop]) {
      statuses.push((await call('POST', '/recommend', { token, body: PICK_BODY })).status);
    }

    // The account allows 3 a day between its devices, where one anonymous device would get 1.
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('keeps an anonymous device on the lower limit', async () => {
    await start();
    const token = await newDeviceToken();

    const first = await call('POST', '/recommend', { token, body: PICK_BODY });
    const second = await call('POST', '/recommend', { token, body: PICK_BODY });

    expect([first.status, second.status]).toEqual([200, 429]);
  });
});
