import { describe, it, expect, beforeEach } from 'vitest';
import { SignInLinkRepository } from './signInLinkRepository';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;

function minutesAfter(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE_MS);
}

/** Behaviour every SignInLinkRepository must share, so the in-memory one is a faithful stand-in. */
export function describeSignInLinkRepository(
  name: string,
  createRepository: () => Promise<SignInLinkRepository>,
): void {
  describe(`${name} (SignInLinkRepository contract)`, () => {
    let links: SignInLinkRepository;

    function add(tokenHash: string, email = 'a@example.com', created = NOW): Promise<void> {
      return links.create({
        tokenHash,
        email,
        createdAt: created,
        expiresAt: new Date(created.getTime() + 15 * MINUTE_MS),
      });
    }

    beforeEach(async () => {
      links = await createRepository();
    });

    it('gives back the email a link was sent to when it is used', async () => {
      await add('hash-a');

      expect(await links.consume('hash-a', minutesAfter(1))).toBe('a@example.com');
    });

    it('works once only', async () => {
      await add('hash-a');
      await links.consume('hash-a', minutesAfter(1));

      expect(await links.consume('hash-a', minutesAfter(2))).toBeNull();
    });

    it('works once only when two requests arrive together', async () => {
      await add('hash-a');

      const results = await Promise.all([
        links.consume('hash-a', minutesAfter(1)),
        links.consume('hash-a', minutesAfter(1)),
        links.consume('hash-a', minutesAfter(1)),
      ]);

      expect(results.filter((email) => email !== null)).toHaveLength(1);
    });

    it('works up to the moment it expires, not at it', async () => {
      await add('hash-a');
      await add('hash-b');

      expect(await links.consume('hash-a', minutesAfter(14))).toBe('a@example.com');
      expect(await links.consume('hash-b', minutesAfter(15))).toBeNull();
    });

    it('knows nothing of a link it was never given', async () => {
      expect(await links.consume('nope', NOW)).toBeNull();
    });

    it('rejects a hash that is already stored', async () => {
      await add('hash-a');

      await expect(add('hash-a')).rejects.toThrow();
    });

    it('counts the links made for an email since a time, used or not', async () => {
      await add('hash-a', 'a@example.com', minutesAfter(-90));
      await add('hash-b', 'a@example.com', minutesAfter(-30));
      await add('hash-c', 'a@example.com', minutesAfter(-5));
      await links.consume('hash-c', NOW);
      await add('hash-d', 'b@example.com', minutesAfter(-5));

      expect(await links.countCreatedSince('a@example.com', minutesAfter(-60))).toBe(2);
    });

    it('counts a link made exactly at the time', async () => {
      await add('hash-a', 'a@example.com', minutesAfter(-60));

      expect(await links.countCreatedSince('a@example.com', minutesAfter(-60))).toBe(1);
    });

    it('counts nothing for an email with no links', async () => {
      expect(await links.countCreatedSince('nobody@example.com', minutesAfter(-60))).toBe(0);
    });

    it('removes one link and leaves the email’s others', async () => {
      await add('hash-a', 'a@example.com');
      await add('hash-b', 'a@example.com');

      await links.deleteByTokenHash('hash-a');

      expect(await links.consume('hash-a', minutesAfter(1))).toBeNull();
      expect(await links.consume('hash-b', minutesAfter(1))).toBe('a@example.com');
    });

    it('does nothing when removing a link it does not have', async () => {
      await links.deleteByTokenHash('nope');

      expect(await links.countCreatedSince('a@example.com', minutesAfter(-60))).toBe(0);
    });

    it('removes every link for an email, and only that email’s', async () => {
      await add('hash-a', 'a@example.com');
      await add('hash-b', 'a@example.com');
      await add('hash-c', 'b@example.com');

      expect(await links.deleteForEmail('a@example.com')).toBe(2);

      expect(await links.consume('hash-a', minutesAfter(1))).toBeNull();
      expect(await links.consume('hash-c', minutesAfter(1))).toBe('b@example.com');
    });

    it('removes links that expired before the cutoff, and keeps the rest', async () => {
      await add('hash-old', 'a@example.com', minutesAfter(-60));
      await add('hash-new', 'a@example.com', NOW);

      // hash-old expired at -45 minutes, hash-new expires at +15.
      expect(await links.deleteExpiredBefore(minutesAfter(-30))).toBe(1);

      expect(await links.consume('hash-new', minutesAfter(1))).toBe('a@example.com');
    });

    it('keeps a link that expires exactly at the cutoff', async () => {
      await add('hash-a', 'a@example.com', NOW);

      expect(await links.deleteExpiredBefore(minutesAfter(15))).toBe(0);
    });
  });
}
