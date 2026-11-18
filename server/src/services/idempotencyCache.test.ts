import { describe, it, expect, vi } from 'vitest';
import { createIdempotencyCache, IDEMPOTENCY_TTL_MS } from './idempotencyCache';

function makeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: (): number => current,
    advance: (ms: number): void => {
      current += ms;
    },
  };
}

describe('createIdempotencyCache', () => {
  it('does the work the first time a key is seen', async () => {
    const cache = createIdempotencyCache<string>();
    const work = vi.fn().mockResolvedValue('pick');

    const result = await cache.run('key-1', work);

    expect(result).toEqual({ value: 'pick', replayed: false });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('answers a repeat of the same key from the first result, without doing the work again', async () => {
    const cache = createIdempotencyCache<string>();
    const work = vi.fn().mockResolvedValue('pick');
    await cache.run('key-1', work);

    const result = await cache.run('key-1', work);

    expect(result).toEqual({ value: 'pick', replayed: true });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('shares one piece of work between requests that arrive while it is still running', async () => {
    const cache = createIdempotencyCache<string>();
    let finish: (value: string) => void = () => {};
    const work = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );

    const first = cache.run('key-1', work);
    const second = cache.run('key-1', work);
    finish('pick');

    expect(await first).toEqual({ value: 'pick', replayed: false });
    expect(await second).toEqual({ value: 'pick', replayed: true });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('keeps different keys apart', async () => {
    const cache = createIdempotencyCache<string>();
    const work = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two');

    const first = await cache.run('key-1', work);
    const second = await cache.run('key-2', work);

    expect(first.value).toBe('one');
    expect(second.value).toBe('two');
  });

  it('forgets a failure, so a retry does the work again', async () => {
    const cache = createIdempotencyCache<string>();
    const work = vi.fn().mockRejectedValueOnce(new Error('Claude is down')).mockResolvedValue('ok');

    await expect(cache.run('key-1', work)).rejects.toThrow('Claude is down');
    const retry = await cache.run('key-1', work);

    expect(retry).toEqual({ value: 'ok', replayed: false });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('gives the same failure to everyone who was waiting on it', async () => {
    const cache = createIdempotencyCache<string>();
    let fail: (error: Error) => void = () => {};
    const work = vi.fn().mockReturnValue(
      new Promise<string>((_resolve, reject) => {
        fail = reject;
      }),
    );

    const first = cache.run('key-1', work).catch((error: unknown) => error);
    const second = cache.run('key-1', work).catch((error: unknown) => error);
    fail(new Error('Claude is down'));

    expect(await first).toMatchObject({ message: 'Claude is down' });
    expect(await second).toMatchObject({ message: 'Claude is down' });
    expect(work).toHaveBeenCalledTimes(1);
  });

  describe('keeping results', () => {
    it('keeps a result for ten minutes', () => {
      expect(IDEMPOTENCY_TTL_MS).toBe(10 * 60 * 1000);
    });

    it('still answers from the result just inside that time', async () => {
      const clock = makeClock();
      const cache = createIdempotencyCache<string>({ now: clock.now });
      const work = vi.fn().mockResolvedValue('pick');
      await cache.run('key-1', work);

      clock.advance(IDEMPOTENCY_TTL_MS - 1);
      const result = await cache.run('key-1', work);

      expect(result.replayed).toBe(true);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('does the work again once the time is up', async () => {
      const clock = makeClock();
      const cache = createIdempotencyCache<string>({ now: clock.now });
      const work = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
      await cache.run('key-1', work);

      clock.advance(IDEMPOTENCY_TTL_MS);
      const result = await cache.run('key-1', work);

      expect(result).toEqual({ value: 'new', replayed: false });
    });

    it('counts the time from when the work finished, not when it started', async () => {
      const clock = makeClock();
      const cache = createIdempotencyCache<string>({ now: clock.now });
      let finish: (value: string) => void = () => {};
      const work = vi.fn().mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      );

      const pending = cache.run('key-1', work);
      clock.advance(60_000);
      finish('pick');
      await pending;
      clock.advance(IDEMPOTENCY_TTL_MS - 1);

      expect((await cache.run('key-1', work)).replayed).toBe(true);
    });
  });

  describe('size', () => {
    it('lets go of the oldest results once it holds more than its limit', async () => {
      const cache = createIdempotencyCache<string>({ maxEntries: 2 });
      const work = vi.fn().mockResolvedValue('pick');
      await cache.run('key-1', work);
      await cache.run('key-2', work);
      await cache.run('key-3', work);
      work.mockClear();

      expect((await cache.run('key-3', work)).replayed).toBe(true);
      expect((await cache.run('key-2', work)).replayed).toBe(true);
      expect((await cache.run('key-1', work)).replayed).toBe(false);
    });

    it('never drops work that is still running to make room', async () => {
      const cache = createIdempotencyCache<string>({ maxEntries: 1 });
      let finish: (value: string) => void = () => {};
      const slow = vi.fn().mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      );
      const quick = vi.fn().mockResolvedValue('quick');

      const running = cache.run('slow', slow);
      await cache.run('quick-1', quick);
      await cache.run('quick-2', quick);
      const joined = cache.run('slow', slow);
      finish('done');

      expect(await running).toEqual({ value: 'done', replayed: false });
      expect(await joined).toEqual({ value: 'done', replayed: true });
      expect(slow).toHaveBeenCalledTimes(1);
    });
  });
});
