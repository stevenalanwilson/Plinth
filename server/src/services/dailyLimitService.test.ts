import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createDailyPickLimiter,
  DailyLimitError,
  secondsUntilNextDay,
  startUsageCleanup,
  removeOldUsage,
  utcDay,
  Visitor,
} from './dailyLimitService';
import { createInMemoryUsageRepository } from '../repositories/inMemoryUsageRepository';
import { UsageRepository } from '../repositories/usageRepository';
import { logger } from '../logger';

const NOON = new Date('2026-11-18T12:00:00.000Z');
const device = (id: string): Visitor => ({ kind: 'device', id });
const account = (id: string): Visitor => ({ kind: 'account', id });
const address = (value: string): Visitor => ({ kind: 'address', address: value });

function limiterWith(
  limits: { perVisitor: number; perAccount?: number; global: number },
  usage: UsageRepository = createInMemoryUsageRepository(),
  now: () => Date = () => NOON,
): ReturnType<typeof createDailyPickLimiter> {
  return createDailyPickLimiter({
    usage,
    limits: { perAccount: 1000, ...limits },
    now,
  });
}

async function scopeOf(promise: Promise<void>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof DailyLimitError) return error.scope;
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDailyPickLimiter', () => {
  it('lets a visitor have picks up to their limit', async () => {
    const limiter = limiterWith({ perVisitor: 3, global: 100 });

    await limiter.consume(device('a'));
    await limiter.consume(device('a'));

    await expect(limiter.consume(device('a'))).resolves.toBeUndefined();
  });

  it('turns a visitor away once they have had their picks, naming the limit they hit', async () => {
    const limiter = limiterWith({ perVisitor: 2, global: 100 });
    await limiter.consume(device('a'));
    await limiter.consume(device('a'));

    const rejection = limiter.consume(device('a'));

    await expect(rejection).rejects.toBeInstanceOf(DailyLimitError);
    await expect(rejection).rejects.toMatchObject({ scope: 'visitor', limit: 2 });
  });

  it('gives a signed-in account its own, higher limit', async () => {
    const limiter = limiterWith({ perVisitor: 1, perAccount: 3, global: 100 });

    await limiter.consume(account('a'));
    await limiter.consume(account('a'));
    await expect(limiter.consume(account('a'))).resolves.toBeUndefined();

    const rejection = limiter.consume(account('a'));
    await expect(rejection).rejects.toMatchObject({ scope: 'visitor', limit: 3 });
  });

  it('counts an account once, whichever of its devices asks', async () => {
    const limiter = limiterWith({ perVisitor: 1, perAccount: 2, global: 100 });
    await limiter.consume(account('a'));
    await limiter.consume(account('a'));

    expect(await scopeOf(limiter.consume(account('a')))).toBe('visitor');
  });

  it('keeps an account apart from a device with the same id', async () => {
    const limiter = limiterWith({ perVisitor: 1, perAccount: 1, global: 100 });
    await limiter.consume(device('x'));

    await expect(limiter.consume(account('x'))).resolves.toBeUndefined();
  });

  it('counts each device on its own', async () => {
    const limiter = limiterWith({ perVisitor: 1, global: 100 });
    await limiter.consume(device('a'));

    await expect(limiter.consume(device('b'))).resolves.toBeUndefined();
  });

  it('counts a request with no device by its address, so one address has one allowance', async () => {
    const limiter = limiterWith({ perVisitor: 1, global: 100 });
    await limiter.consume(address('203.0.113.7'));

    expect(await scopeOf(limiter.consume(address('203.0.113.7')))).toBe('visitor');
    await expect(limiter.consume(address('203.0.113.8'))).resolves.toBeUndefined();
  });

  it('keeps a device and an address that look alike apart', async () => {
    const limiter = limiterWith({ perVisitor: 1, global: 100 });
    await limiter.consume(device('203.0.113.7'));

    await expect(limiter.consume(address('203.0.113.7'))).resolves.toBeUndefined();
  });

  it('never writes an address down as it is', async () => {
    const usage = createInMemoryUsageRepository();
    const spy = vi.spyOn(usage, 'tryConsume');

    await limiterWith({ perVisitor: 5, global: 100 }, usage).consume(address('203.0.113.7'));

    const subjects = spy.mock.calls.map(([subject]) => subject);
    expect(subjects.some((subject) => subject.includes('203.0.113.7'))).toBe(false);
  });

  it('stops everyone once the day’s total is used, whoever they are', async () => {
    const limiter = limiterWith({ perVisitor: 10, global: 2 });
    await limiter.consume(device('a'));
    await limiter.consume(device('b'));

    expect(await scopeOf(limiter.consume(device('c')))).toBe('global');
  });

  it('does not use up the total on a visitor who is over their own limit', async () => {
    const limiter = limiterWith({ perVisitor: 1, global: 2 });
    await limiter.consume(device('a'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await scopeOf(limiter.consume(device('a')));
    }

    await expect(limiter.consume(device('b'))).resolves.toBeUndefined();
  });

  it('gives a visitor their pick back when the total turned them away', async () => {
    const usage = createInMemoryUsageRepository();
    let allowed = 1;
    const limiter = limiterWith({ perVisitor: 1, global: allowed }, usage);
    await limiter.consume(device('a'));
    expect(await scopeOf(limiter.consume(device('b')))).toBe('global');

    // The total is raised, as when the next instance starts with a bigger limit: b still has
    // their one pick, because being turned away didn't use it.
    allowed = 5;
    const raised = limiterWith({ perVisitor: 1, global: allowed }, usage);

    await expect(raised.consume(device('b'))).resolves.toBeUndefined();
  });

  it('starts everyone again at midnight UTC', async () => {
    let now = new Date('2026-11-18T23:59:59.000Z');
    const limiter = limiterWith({ perVisitor: 1, global: 1 }, undefined, () => now);
    await limiter.consume(device('a'));
    expect(await scopeOf(limiter.consume(device('a')))).not.toBeNull();

    now = new Date('2026-11-19T00:00:00.000Z');

    await expect(limiter.consume(device('a'))).resolves.toBeUndefined();
  });

  it('allows nothing when the limit is zero, which pauses picks', async () => {
    expect(await scopeOf(limiterWith({ perVisitor: 5, global: 0 }).consume(device('a')))).toBe(
      'global',
    );
    expect(await scopeOf(limiterWith({ perVisitor: 0, global: 5 }).consume(device('a')))).toBe(
      'visitor',
    );
  });

  describe('when the counts cannot be reached', () => {
    function brokenUsage(): UsageRepository {
      return {
        tryConsume: vi.fn().mockRejectedValue(new Error('connection lost')),
        release: vi.fn().mockResolvedValue(undefined),
        deleteBefore: vi.fn().mockResolvedValue(0),
      };
    }

    it('lets the pick through rather than stopping everyone, and says so in the log', async () => {
      const limiter = limiterWith({ perVisitor: 1, global: 1 }, brokenUsage());

      await expect(limiter.consume(device('a'))).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        { error: 'connection lost' },
        'daily limit check failed',
      );
    });

    it('still turns a visitor away if only giving a pick back fails', async () => {
      const usage = createInMemoryUsageRepository();
      await usage.tryConsume('global', utcDay(NOON), 1);
      vi.spyOn(usage, 'release').mockRejectedValue(new Error('connection lost'));
      const limiter = limiterWith({ perVisitor: 5, global: 1 }, usage);

      expect(await scopeOf(limiter.consume(device('a')))).toBe('global');
    });
  });
});

describe('utcDay', () => {
  it('is the UTC date, whatever the time', () => {
    expect(utcDay(new Date('2026-11-18T00:00:00.000Z'))).toBe('2026-11-18');
    expect(utcDay(new Date('2026-11-18T23:59:59.999Z'))).toBe('2026-11-18');
  });
});

describe('secondsUntilNextDay', () => {
  it('counts to the next midnight UTC', () => {
    expect(secondsUntilNextDay(new Date('2026-11-18T23:00:00.000Z'))).toBe(3600);
    expect(secondsUntilNextDay(new Date('2026-11-18T12:00:00.000Z'))).toBe(12 * 3600);
  });

  it('is a whole day just after midnight', () => {
    expect(secondsUntilNextDay(new Date('2026-11-19T00:00:00.000Z'))).toBe(24 * 3600);
  });

  it('rounds up, so a client never comes back a moment too early', () => {
    expect(secondsUntilNextDay(new Date('2026-11-18T23:59:59.500Z'))).toBe(1);
  });
});

describe('removeOldUsage', () => {
  it('removes the counts for days before today', async () => {
    const usage = createInMemoryUsageRepository();
    await usage.tryConsume('device:a', '2026-11-17', 1);
    await usage.tryConsume('device:a', '2026-11-18', 1);

    expect(await removeOldUsage(usage, NOON)).toBe(1);
  });
});

describe('startUsageCleanup', () => {
  it('removes old counts on a timer, and stops when told to', async () => {
    vi.useFakeTimers();
    const usage = createInMemoryUsageRepository();
    const spy = vi.spyOn(usage, 'deleteBefore');

    const stop = startUsageCleanup(usage, 1000);
    await vi.advanceTimersByTimeAsync(2500);
    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('logs a failure instead of throwing', async () => {
    vi.useFakeTimers();
    const usage = createInMemoryUsageRepository();
    vi.spyOn(usage, 'deleteBefore').mockRejectedValue(new Error('connection lost'));

    const stop = startUsageCleanup(usage, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(logger.error).toHaveBeenCalledWith({ error: 'connection lost' }, 'usage cleanup failed');
    vi.useRealTimers();
  });
});
