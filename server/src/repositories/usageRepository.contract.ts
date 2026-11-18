import { describe, it, expect, beforeEach } from 'vitest';
import { UsageRepository } from './usageRepository';

const TODAY = '2026-11-18';
const TOMORROW = '2026-11-19';

async function consumeUpTo(
  usage: UsageRepository,
  subject: string,
  day: string,
  limit: number,
  attempts: number,
): Promise<number> {
  let allowed = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await usage.tryConsume(subject, day, limit)) allowed += 1;
  }
  return allowed;
}

/** Behaviour every UsageRepository must share, so the in-memory one is a faithful stand-in. */
export function describeUsageRepository(
  name: string,
  createRepository: () => Promise<UsageRepository>,
): void {
  describe(`${name} (UsageRepository contract)`, () => {
    let usage: UsageRepository;

    beforeEach(async () => {
      usage = await createRepository();
    });

    it('lets a subject use up to the limit and no more', async () => {
      expect(await consumeUpTo(usage, 'device:a', TODAY, 3, 10)).toBe(3);
    });

    it('says whether each use was allowed', async () => {
      expect(await usage.tryConsume('device:a', TODAY, 1)).toBe(true);
      expect(await usage.tryConsume('device:a', TODAY, 1)).toBe(false);
    });

    it('keeps subjects apart', async () => {
      await consumeUpTo(usage, 'device:a', TODAY, 2, 5);

      expect(await usage.tryConsume('device:b', TODAY, 2)).toBe(true);
    });

    it('starts again on a new day', async () => {
      await consumeUpTo(usage, 'device:a', TODAY, 2, 5);

      expect(await consumeUpTo(usage, 'device:a', TOMORROW, 2, 5)).toBe(2);
    });

    it('applies whichever limit it is given, so the limit can change between calls', async () => {
      await consumeUpTo(usage, 'device:a', TODAY, 2, 2);

      expect(await usage.tryConsume('device:a', TODAY, 2)).toBe(false);
      expect(await usage.tryConsume('device:a', TODAY, 3)).toBe(true);
    });

    it('allows nothing when the limit is zero', async () => {
      expect(await usage.tryConsume('device:a', TODAY, 0)).toBe(false);
    });

    it('does not count a use it turned away', async () => {
      await consumeUpTo(usage, 'device:a', TODAY, 2, 6);
      await usage.release('device:a', TODAY);

      // One place is free again, not four: the turned-away attempts were never counted.
      expect(await consumeUpTo(usage, 'device:a', TODAY, 2, 6)).toBe(1);
    });

    it('gives a place back when a use is released', async () => {
      await consumeUpTo(usage, 'device:a', TODAY, 2, 2);

      await usage.release('device:a', TODAY);

      expect(await usage.tryConsume('device:a', TODAY, 2)).toBe(true);
    });

    it('never goes below zero when something is released that was not used', async () => {
      await usage.release('device:a', TODAY);
      await usage.release('device:a', TODAY);

      expect(await consumeUpTo(usage, 'device:a', TODAY, 2, 6)).toBe(2);
    });

    it('lets requests that arrive together use no more than the limit between them', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => usage.tryConsume('global', TODAY, 5)),
      );

      expect(results.filter(Boolean)).toHaveLength(5);
    });

    it('removes the counts for earlier days, and keeps the rest', async () => {
      await usage.tryConsume('device:a', '2026-11-16', 5);
      await usage.tryConsume('device:b', '2026-11-17', 5);
      await usage.tryConsume('device:a', TODAY, 1);

      const removed = await usage.deleteBefore(TODAY);

      expect(removed).toBe(2);
      // Today's count survived: device:a is still at its limit of one.
      expect(await usage.tryConsume('device:a', TODAY, 1)).toBe(false);
    });

    it('removes nothing when there is nothing older', async () => {
      await usage.tryConsume('device:a', TODAY, 1);

      expect(await usage.deleteBefore(TODAY)).toBe(0);
    });
  });
}
