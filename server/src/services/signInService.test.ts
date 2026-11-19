import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  deleteAccount,
  MAX_LINKS_PER_EMAIL_PER_HOUR,
  normaliseEmail,
  removeOldSignInLinks,
  requestSignIn,
  SIGN_IN_LINK_TTL_MS,
  SignInEmailError,
  signOut,
  startSignInLinkCleanup,
  TooManySignInRequestsError,
  verifySignIn,
} from './signInService';
import { EmailMessage, EmailSender } from './emailSender';
import { createInMemoryAccountRepository } from '../repositories/inMemoryAccountRepository';
import { createInMemoryDeviceRepository } from '../repositories/inMemoryDeviceRepository';
import { createInMemoryLibraryRepository } from '../repositories/inMemoryLibraryRepository';
import { createInMemorySignInLinkRepository } from '../repositories/inMemorySignInLinkRepository';
import { logger } from '../logger';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const after = (minutes: number): Date => new Date(NOW.getTime() + minutes * MINUTE_MS);

function setup(): {
  links: ReturnType<typeof createInMemorySignInLinkRepository>;
  accounts: ReturnType<typeof createInMemoryAccountRepository>;
  devices: ReturnType<typeof createInMemoryDeviceRepository>;
  library: ReturnType<typeof createInMemoryLibraryRepository>;
  sent: EmailMessage[];
  sender: EmailSender;
  request: (email: string, now?: Date) => Promise<void>;
  tokenSentTo: (email: string) => string;
} {
  const links = createInMemorySignInLinkRepository();
  const accounts = createInMemoryAccountRepository();
  const devices = createInMemoryDeviceRepository();
  const library = createInMemoryLibraryRepository();
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    send: async (message): Promise<void> => {
      sent.push(message);
    },
  };
  return {
    links,
    accounts,
    devices,
    library,
    sent,
    sender,
    request: (email: string, now: Date = NOW): Promise<void> =>
      requestSignIn({ links, sender, baseUrl: 'https://plinth.example' }, email, now),
    tokenSentTo: (email: string): string => {
      const message = [...sent].reverse().find((m) => m.to === email);
      const match = message?.text.match(/#token=(\S+)/);
      if (!match) throw new Error(`no link was sent to ${email}`);
      return match[1];
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normaliseEmail', () => {
  it('trims and lower-cases an address', () => {
    expect(normaliseEmail('  Person@Example.COM ')).toBe('person@example.com');
  });

  it.each(['', '   ', 'nobody', 'a@b', '@example.com', 'a@', 'a b@example.com', 'a@@example.com'])(
    'refuses %j, which is not shaped like an address',
    (value) => {
      expect(normaliseEmail(value)).toBeNull();
    },
  );

  it('refuses anything that is not text', () => {
    expect(normaliseEmail(undefined)).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
    expect(normaliseEmail(['a@example.com'])).toBeNull();
  });

  it('refuses an address longer than any can be', () => {
    expect(normaliseEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });

  it('keeps a plus tag, since it is part of the address', () => {
    expect(normaliseEmail('a+plinth@example.com')).toBe('a+plinth@example.com');
  });
});

describe('requestSignIn', () => {
  it('emails the address a link that opens the sign-in page', async () => {
    const { request, sent } = setup();

    await request('a@example.com');

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('a@example.com');
    expect(sent[0].text).toMatch(/https:\/\/plinth\.example\/signin#token=pls_[A-Za-z0-9_-]{43}\b/);
  });

  it('puts the token after the #, which browsers never send to a server', async () => {
    const { request, sent } = setup();

    await request('a@example.com');

    expect(sent[0].text).not.toMatch(/\?[^\s]*token=/);
    expect(sent[0].text).toContain('/signin#token=');
  });

  it('copes with a base address that ends in a slash', async () => {
    const { links, sender, sent } = setup();

    await requestSignIn(
      { links, sender, baseUrl: 'https://plinth.example/' },
      'a@example.com',
      NOW,
    );

    expect(sent[0].text).toContain('https://plinth.example/signin#token=');
  });

  it('says how long the link works for, and that it can be ignored', async () => {
    const { request, sent } = setup();

    await request('a@example.com');

    expect(sent[0].text).toContain('works once and expires in 15 minutes');
    expect(sent[0].text).toContain("If you didn't ask for it, you can ignore this email");
  });

  it('makes a different link each time', async () => {
    const { request, tokenSentTo } = setup();

    await request('a@example.com');
    const first = tokenSentTo('a@example.com');
    await request('a@example.com');

    expect(tokenSentTo('a@example.com')).not.toBe(first);
  });

  it('refuses once the address has been sent as many as it can in an hour', async () => {
    const { request, sent } = setup();
    for (let i = 0; i < MAX_LINKS_PER_EMAIL_PER_HOUR; i += 1) await request('a@example.com');

    await expect(request('a@example.com')).rejects.toBeInstanceOf(TooManySignInRequestsError);

    expect(sent).toHaveLength(MAX_LINKS_PER_EMAIL_PER_HOUR);
  });

  it('counts each address on its own', async () => {
    const { request } = setup();
    for (let i = 0; i < MAX_LINKS_PER_EMAIL_PER_HOUR; i += 1) await request('a@example.com');

    await expect(request('b@example.com')).resolves.toBeUndefined();
  });

  it('sends again once the hour is up', async () => {
    const { request } = setup();
    for (let i = 0; i < MAX_LINKS_PER_EMAIL_PER_HOUR; i += 1) await request('a@example.com');

    await expect(request('a@example.com', after(61))).resolves.toBeUndefined();
  });

  it('takes back a link that could not be sent, so it neither waits nor counts', async () => {
    const { links } = setup();
    const failing: EmailSender = { send: vi.fn().mockRejectedValue(new Error('Resend refused')) };

    await expect(
      requestSignIn(
        { links, sender: failing, baseUrl: 'https://plinth.example' },
        'a@example.com',
        NOW,
      ),
    ).rejects.toBeInstanceOf(SignInEmailError);

    expect(await links.countCreatedSince('a@example.com', after(-60))).toBe(0);
  });

  it('does not take back the links the address was sent before', async () => {
    const { links, request, tokenSentTo, accounts, devices } = setup();
    await request('a@example.com');
    const earlier = tokenSentTo('a@example.com');
    const failing: EmailSender = { send: vi.fn().mockRejectedValue(new Error('Resend refused')) };
    await requestSignIn(
      { links, sender: failing, baseUrl: 'https://plinth.example' },
      'a@example.com',
      NOW,
    ).catch(() => undefined);
    const device = await devices.create('hash-a', NOW);

    const signedIn = await verifySignIn({ links, accounts, devices }, earlier, device.id, after(1));

    expect(signedIn?.email).toBe('a@example.com');
  });

  it('keeps the reason the email failed, without the address', async () => {
    const { links } = setup();
    const failing: EmailSender = { send: vi.fn().mockRejectedValue(new Error('status 422')) };

    const failure = requestSignIn(
      { links, sender: failing, baseUrl: 'https://plinth.example' },
      'a@example.com',
      NOW,
    );

    await expect(failure).rejects.toThrow('status 422');
    await expect(failure).rejects.not.toThrow(/example\.com/);
  });
});

describe('verifySignIn', () => {
  async function signInDevice(): Promise<{
    env: ReturnType<typeof setup>;
    deviceId: string;
    token: string;
  }> {
    const env = setup();
    await env.request('a@example.com');
    const device = await env.devices.create('hash-a', NOW);
    return { env, deviceId: device.id, token: env.tokenSentTo('a@example.com') };
  }

  it('signs the device in and says whose account it is', async () => {
    const { env, deviceId, token } = await signInDevice();

    const result = await verifySignIn(env, token, deviceId, after(1));

    expect(result).toEqual({ email: 'a@example.com', created: true });
    const account = (await env.accounts.findOrCreateByEmail('a@example.com', NOW)).account;
    expect((await env.devices.findByTokenHash('hash-a'))?.accountId).toBe(account.id);
  });

  it('says it is a return when the account already existed', async () => {
    const { env, deviceId, token } = await signInDevice();
    await verifySignIn(env, token, deviceId, after(1));
    await env.request('a@example.com', after(2));
    const second = await env.devices.create('hash-b', NOW);

    const result = await verifySignIn(env, env.tokenSentTo('a@example.com'), second.id, after(3));

    expect(result?.created).toBe(false);
  });

  it('signs in two devices to the same account', async () => {
    const { env, deviceId, token } = await signInDevice();
    await verifySignIn(env, token, deviceId, after(1));
    await env.request('a@example.com', after(2));
    const second = await env.devices.create('hash-b', NOW);
    await verifySignIn(env, env.tokenSentTo('a@example.com'), second.id, after(3));

    const first = await env.devices.findByTokenHash('hash-a');
    const other = await env.devices.findByTokenHash('hash-b');
    expect(first?.accountId).toBe(other?.accountId);
    expect(first?.accountId).not.toBeNull();
  });

  it('works once only', async () => {
    const { env, deviceId, token } = await signInDevice();
    await verifySignIn(env, token, deviceId, after(1));

    expect(await verifySignIn(env, token, deviceId, after(2))).toBeNull();
  });

  it('does not work after fifteen minutes', async () => {
    const { env, deviceId, token } = await signInDevice();

    expect(await verifySignIn(env, token, deviceId, after(15))).toBeNull();
    expect(SIGN_IN_LINK_TTL_MS).toBe(15 * MINUTE_MS);
  });

  it('does not sign in a device with a link that is wrong', async () => {
    const { env, deviceId } = await signInDevice();

    expect(await verifySignIn(env, `pls_${'a'.repeat(43)}`, deviceId, after(1))).toBeNull();
    expect((await env.devices.findByTokenHash('hash-a'))?.accountId).toBeNull();
  });

  it.each(['', 'pls_short', 'pld_' + 'a'.repeat(43), 'a'.repeat(47), `pls_${'a'.repeat(43)}x`])(
    'turns away %j without looking anything up',
    async (junk) => {
      const { env, deviceId } = await signInDevice();
      const spy = vi.spyOn(env.links, 'consume');

      expect(await verifySignIn(env, junk, deviceId, after(1))).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('does not make an account when the link is wrong', async () => {
    const { env, deviceId } = await signInDevice();

    await verifySignIn(env, `pls_${'a'.repeat(43)}`, deviceId, after(1));

    expect((await env.accounts.findOrCreateByEmail('a@example.com', NOW)).created).toBe(true);
  });
});

describe('signOut', () => {
  it('signs the device out and leaves the account and its other devices', async () => {
    const env = setup();
    await env.request('a@example.com');
    const first = await env.devices.create('hash-a', NOW);
    const second = await env.devices.create('hash-b', NOW);
    await verifySignIn(env, env.tokenSentTo('a@example.com'), first.id, after(1));
    await env.request('a@example.com', after(2));
    await verifySignIn(env, env.tokenSentTo('a@example.com'), second.id, after(3));

    await signOut(env.devices, first.id);

    expect((await env.devices.findByTokenHash('hash-a'))?.accountId).toBeNull();
    expect((await env.devices.findByTokenHash('hash-b'))?.accountId).not.toBeNull();
  });
});

describe('deleteAccount', () => {
  async function accountWithTwoDevices(): Promise<{
    env: ReturnType<typeof setup>;
    accountId: string;
  }> {
    const env = setup();
    await env.request('a@example.com');
    const first = await env.devices.create('hash-a', NOW);
    await verifySignIn(env, env.tokenSentTo('a@example.com'), first.id, after(1));
    await env.request('a@example.com', after(2));
    const second = await env.devices.create('hash-b', NOW);
    await verifySignIn(env, env.tokenSentTo('a@example.com'), second.id, after(3));
    // A link nobody has opened yet.
    await env.request('a@example.com', after(4));
    const accountId = (await env.devices.findByTokenHash('hash-a'))?.accountId as string;
    return { env, accountId };
  }

  it('removes the account', async () => {
    const { env, accountId } = await accountWithTwoDevices();

    expect(await deleteAccount(env, accountId)).toBe(true);

    expect(await env.accounts.findById(accountId)).toBeNull();
  });

  it('signs every device out of it', async () => {
    const { env, accountId } = await accountWithTwoDevices();

    await deleteAccount(env, accountId);

    expect((await env.devices.findByTokenHash('hash-a'))?.accountId).toBeNull();
    expect((await env.devices.findByTokenHash('hash-b'))?.accountId).toBeNull();
  });

  it('removes the saved crate', async () => {
    const { env, accountId } = await accountWithTwoDevices();
    await env.library.sync(accountId, {
      items: [
        {
          recommendation: { artist: 'A', album: 'B', year: '1999', reason: 'r' },
          artwork: { artworkUrl: null, year: null, appleMusicUrl: null },
          createdAt: NOW.toISOString(),
        },
      ],
      deletions: [],
      since: null,
      now: NOW,
    });

    await deleteAccount(env, accountId);

    expect(
      await env.library.sync(accountId, { items: [], deletions: [], since: null, now: NOW }),
    ).toEqual([]);
  });

  it('removes the links still waiting to be used', async () => {
    const { env, accountId } = await accountWithTwoDevices();
    const waiting = env.tokenSentTo('a@example.com');
    const device = await env.devices.create('hash-c', NOW);

    await deleteAccount(env, accountId);

    expect(await verifySignIn(env, waiting, device.id, after(5))).toBeNull();
  });

  it('leaves other people’s accounts and devices alone', async () => {
    const { env, accountId } = await accountWithTwoDevices();
    await env.request('b@example.com', after(5));
    const other = await env.devices.create('hash-z', NOW);
    await verifySignIn(env, env.tokenSentTo('b@example.com'), other.id, after(6));

    await deleteAccount(env, accountId);

    expect((await env.devices.findByTokenHash('hash-z'))?.accountId).not.toBeNull();
  });

  it('says so when there is no such account', async () => {
    const env = setup();

    expect(await deleteAccount(env, '11111111-1111-4111-8111-111111111111')).toBe(false);
  });

  it('lets the same email start again as a new account', async () => {
    const { env, accountId } = await accountWithTwoDevices();

    await deleteAccount(env, accountId);

    expect((await env.accounts.findOrCreateByEmail('a@example.com', NOW)).created).toBe(true);
  });
});

describe('removeOldSignInLinks', () => {
  it('removes links that expired more than a day ago, and keeps the rest', async () => {
    const env = setup();
    await env.request('a@example.com', after(-2 * 24 * 60));
    await env.request('b@example.com', NOW);

    expect(await removeOldSignInLinks(env.links, NOW)).toBe(1);
    expect(await env.links.countCreatedSince('b@example.com', after(-60))).toBe(1);
  });
});

describe('startSignInLinkCleanup', () => {
  it('removes old links on a timer, and stops when told to', async () => {
    vi.useFakeTimers();
    const { links } = setup();
    const spy = vi.spyOn(links, 'deleteExpiredBefore');

    const stop = startSignInLinkCleanup(links, 1000);
    await vi.advanceTimersByTimeAsync(2500);
    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('logs a failure instead of throwing', async () => {
    vi.useFakeTimers();
    const { links } = setup();
    vi.spyOn(links, 'deleteExpiredBefore').mockRejectedValue(new Error('connection lost'));

    const stop = startSignInLinkCleanup(links, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(logger.error).toHaveBeenCalledWith(
      { error: 'connection lost' },
      'sign-in link cleanup failed',
    );
    vi.useRealTimers();
  });
});
