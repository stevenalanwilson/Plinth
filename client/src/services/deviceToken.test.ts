import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearDeviceToken, ensureDeviceToken, getStoredToken } from './deviceToken';

const KEY = 'plinth-device-token';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredToken', () => {
  it('has nothing before a token is stored', () => {
    expect(getStoredToken()).toBeNull();
  });

  it('returns the stored token', () => {
    localStorage.setItem(KEY, 'pld_abc');

    expect(getStoredToken()).toBe('pld_abc');
  });

  it('has nothing when there is no storage, or it refuses to be read', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    expect(getStoredToken(null)).toBeNull();
    expect(getStoredToken(broken)).toBeNull();
  });
});

describe('ensureDeviceToken', () => {
  it('gives the stored token without asking the server', async () => {
    localStorage.setItem(KEY, 'pld_abc');
    const askServer = vi.fn().mockResolvedValue('pld_new');

    expect(await ensureDeviceToken(askServer)).toBe('pld_abc');
    expect(askServer).not.toHaveBeenCalled();
  });

  it('asks the server the first time, and keeps what it is given', async () => {
    const askServer = vi.fn().mockResolvedValue('pld_new');

    expect(await ensureDeviceToken(askServer)).toBe('pld_new');
    expect(localStorage.getItem(KEY)).toBe('pld_new');
  });

  it('does not ask again once it has a token', async () => {
    const askServer = vi.fn().mockResolvedValue('pld_new');

    await ensureDeviceToken(askServer);
    await ensureDeviceToken(askServer);

    expect(askServer).toHaveBeenCalledTimes(1);
  });

  it('asks the server once when several requests need a token at the same moment', async () => {
    let release: (token: string) => void = () => undefined;
    const askServer = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));

    const tokens = Promise.all([
      ensureDeviceToken(askServer),
      ensureDeviceToken(askServer),
      ensureDeviceToken(askServer),
    ]);
    release('pld_shared');

    expect(await tokens).toEqual(['pld_shared', 'pld_shared', 'pld_shared']);
    expect(askServer).toHaveBeenCalledTimes(1);
  });

  it('carries on without a token when the server says no, and tries again next time', async () => {
    const askServer = vi
      .fn()
      .mockRejectedValueOnce(new Error('Too many requests'))
      .mockResolvedValueOnce('pld_later');

    expect(await ensureDeviceToken(askServer)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();

    expect(await ensureDeviceToken(askServer)).toBe('pld_later');
  });

  it('asks again after the token has been forgotten', async () => {
    const askServer = vi
      .fn()
      .mockResolvedValueOnce('pld_first')
      .mockResolvedValueOnce('pld_second');
    await ensureDeviceToken(askServer);

    clearDeviceToken();

    expect(await ensureDeviceToken(askServer)).toBe('pld_second');
  });

  it('stays anonymous, without asking, when there is no storage', async () => {
    const askServer = vi.fn().mockResolvedValue('pld_new');

    expect(await ensureDeviceToken(askServer, null)).toBeNull();
    expect(askServer).not.toHaveBeenCalled();
  });

  it('stays anonymous, without asking, when a token could not be kept', async () => {
    const unwritable = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    const askServer = vi.fn().mockResolvedValue('pld_new');

    expect(await ensureDeviceToken(askServer, unwritable)).toBeNull();
    expect(askServer).not.toHaveBeenCalled();
  });

  it('leaves no probe behind in storage', async () => {
    await ensureDeviceToken(vi.fn().mockResolvedValue('pld_new'));

    expect(localStorage.length).toBe(1);
  });
});

describe('clearDeviceToken', () => {
  it('forgets the token', () => {
    localStorage.setItem(KEY, 'pld_abc');

    clearDeviceToken();

    expect(getStoredToken()).toBeNull();
  });

  it('does not throw without storage, or when storage refuses', () => {
    const broken = {
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    expect(() => clearDeviceToken(null)).not.toThrow();
    expect(() => clearDeviceToken(broken)).not.toThrow();
  });
});
