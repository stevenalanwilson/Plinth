import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryItem } from '@shared/types';
import { LibraryFullError, LibraryRecord, LibraryRepository } from './libraryRepository';

const T0 = new Date('2026-11-19T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function after(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

function daysBefore(days: number): string {
  return new Date(T0.getTime() - days * DAY_MS).toISOString();
}

function item(album: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    recommendation: { artist: 'Artist', album, year: '1999', reason: 'Good.' },
    artwork: { artworkUrl: null, year: null, appleMusicUrl: null },
    createdAt: daysBefore(10),
    ...overrides,
  };
}

function keysOf(records: readonly LibraryRecord[]): string[] {
  return records.map((record) => record.key).sort();
}

export interface LibraryRepositoryFixture {
  readonly library: LibraryRepository;
  /** An account whose crate can be saved: Postgres only accepts one that exists. */
  readonly newAccountId: () => Promise<string>;
}

/** Behaviour every LibraryRepository must share, so the in-memory one is a faithful stand-in. */
export function describeLibraryRepository(
  name: string,
  createFixture: () => Promise<LibraryRepositoryFixture>,
): void {
  describe(`${name} (LibraryRepository contract)`, () => {
    let library: LibraryRepository;
    let newAccountId: () => Promise<string>;
    let accountId: string;

    function save(
      account: string,
      items: LibraryItem[],
      options: {
        deletions?: { key: string; at: string }[];
        since?: Date | null;
        now?: Date;
        maxRecords?: number;
      } = {},
    ): Promise<readonly LibraryRecord[]> {
      return library.sync(account, {
        items,
        deletions: (options.deletions ?? []).map(({ key, at }) => ({ key, at: new Date(at) })),
        since: options.since ?? null,
        now: options.now ?? T0,
        maxRecords: options.maxRecords ?? 1_000,
      });
    }

    beforeEach(async () => {
      ({ library, newAccountId } = await createFixture());
      accountId = await newAccountId();
    });

    it('stores albums and returns them all when asked for everything', async () => {
      const saved = await save(accountId, [item('A'), item('B')]);

      expect(keysOf(saved)).toEqual(['artist|a', 'artist|b']);
      expect(saved[0]).toMatchObject({ kind: 'album', updatedAt: T0 });
    });

    it('keeps an album and every detail of it', async () => {
      const full = item('A', {
        recommendation: {
          artist: 'Artist',
          album: 'A',
          year: '1999',
          reason: 'Good.',
          genres: ['rock'],
          country: 'GB',
          slug: 'artist-a',
          hook: 'A hook.',
          releaseGroupId: 'rg-1',
        },
        artwork: { artworkUrl: 'https://img/a.jpg', year: '1999', appleMusicUrl: null },
        feedback: { status: 'own', at: daysBefore(2) },
      });
      await save(accountId, [full]);

      const [record] = await save(accountId, []);

      expect(record).toMatchObject({ kind: 'album', item: full });
    });

    it('returns only what changed after `since`', async () => {
      await save(accountId, [item('A')], { now: T0 });
      await save(accountId, [item('B')], { now: after(T0, 60_000) });

      const changed = await save(accountId, [], {
        since: after(T0, 30_000),
        now: after(T0, 90_000),
      });

      expect(keysOf(changed)).toEqual(['artist|b']);
    });

    it('writes nothing for a repeated request, so a later `since` sees no change', async () => {
      await save(accountId, [item('A')], { now: T0 });

      await save(accountId, [item('A')], { now: after(T0, 60_000) });
      const changed = await save(accountId, [], {
        since: after(T0, 30_000),
        now: after(T0, 90_000),
      });

      expect(changed).toEqual([]);
    });

    it('keeps the newer verdict from two devices', async () => {
      await save(accountId, [item('A', { feedback: { status: 'save', at: daysBefore(3) } })]);

      await save(accountId, [item('A', { feedback: { status: 'own', at: daysBefore(1) } })]);
      const [record] = await save(accountId, [
        item('A', { feedback: { status: 'heard', at: daysBefore(5) } }),
      ]);

      expect(record).toMatchObject({ item: { feedback: { status: 'own', at: daysBefore(1) } } });
    });

    it('remembers a removal and returns it as one', async () => {
      await save(accountId, [item('A')]);

      const saved = await save(accountId, [], {
        deletions: [{ key: 'artist|a', at: daysBefore(1) }],
      });

      expect(saved).toEqual([
        { kind: 'removed', key: 'artist|a', removedAt: new Date(daysBefore(1)), updatedAt: T0 },
      ]);
    });

    it('does not bring a removed album back from an older copy', async () => {
      await save(accountId, [item('A')], { deletions: [{ key: 'artist|a', at: daysBefore(1) }] });

      const saved = await save(accountId, [item('A', { createdAt: daysBefore(10) })]);

      expect(saved).toEqual([expect.objectContaining({ kind: 'removed', key: 'artist|a' })]);
    });

    it('brings a removed album back for a change made after the removal', async () => {
      await save(accountId, [], { deletions: [{ key: 'artist|a', at: daysBefore(5) }] });

      const saved = await save(accountId, [
        item('A', { feedback: { status: 'own', at: daysBefore(1) } }),
      ]);

      expect(saved).toEqual([expect.objectContaining({ kind: 'album', key: 'artist|a' })]);
    });

    it('keeps each account to itself', async () => {
      const other = await newAccountId();
      await save(accountId, [item('A')]);
      await save(other, [item('B')]);

      expect(keysOf(await save(accountId, []))).toEqual(['artist|a']);
      expect(keysOf(await save(other, []))).toEqual(['artist|b']);
    });

    it('clears out unrated picks past the age limit but never a rated album', async () => {
      await save(accountId, [
        item('Old pick', { createdAt: daysBefore(100) }),
        item('Old owned', {
          createdAt: daysBefore(100),
          feedback: { status: 'own', at: daysBefore(99) },
        }),
        item('Fresh'),
      ]);

      expect(keysOf(await save(accountId, []))).toEqual(['artist|fresh', 'artist|old owned']);
    });

    it('forgets a removal after it has been kept long enough', async () => {
      await save(accountId, [], { deletions: [{ key: 'artist|a', at: daysBefore(1) }] });

      const later = await save(accountId, [], { now: after(T0, 61 * DAY_MS) });

      expect(later).toEqual([]);
    });

    it('removes everything saved for one account and nothing for another', async () => {
      const other = await newAccountId();
      await save(accountId, [item('A')], { deletions: [{ key: 'artist|b', at: daysBefore(1) }] });
      await save(other, [item('C')]);

      await library.removeAll(accountId);

      expect(await save(accountId, [])).toEqual([]);
      expect(keysOf(await save(other, []))).toEqual(['artist|c']);
    });

    it('applies two saves made at once for one account one after the other', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          save(accountId, [item(`Album ${index}`)], { now: after(T0, index) }),
        ),
      );

      expect(results).toHaveLength(8);
      expect(keysOf(await save(accountId, []))).toHaveLength(8);
    });

    it('settles on the newest verdict whichever of simultaneous saves arrives last', async () => {
      await Promise.all(
        [1, 2, 3, 4, 5].map((day) =>
          save(accountId, [item('A', { feedback: { status: 'own', at: daysBefore(day) } })]),
        ),
      );

      const [record] = await save(accountId, []);

      expect(record).toMatchObject({ item: { feedback: { at: daysBefore(1) } } });
    });

    describe('the most an account can hold', () => {
      it('refuses changes that would make the crate bigger than that, and saves none of them', async () => {
        await save(accountId, [item('A'), item('B')], { maxRecords: 3 });

        await expect(save(accountId, [item('C'), item('D')], { maxRecords: 3 })).rejects.toThrow(
          LibraryFullError,
        );

        expect(keysOf(await save(accountId, [], { maxRecords: 3 }))).toEqual([
          'artist|a',
          'artist|b',
        ]);
      });

      it('counts what has been removed too, since it is kept for a while', async () => {
        await save(accountId, [item('A'), item('B')], { maxRecords: 3 });

        await expect(
          save(accountId, [], {
            maxRecords: 3,
            deletions: [
              { key: 'artist|x', at: daysBefore(1) },
              { key: 'artist|y', at: daysBefore(1) },
            ],
          }),
        ).rejects.toThrow(LibraryFullError);
      });

      it('still accepts changes to what is already held, at the limit', async () => {
        await save(accountId, [item('A'), item('B')], { maxRecords: 2 });

        const saved = await save(
          accountId,
          [item('A', { feedback: { status: 'own', at: daysBefore(1) } })],
          { maxRecords: 2 },
        );

        expect(saved).toHaveLength(2);
      });

      it('lets a crate that is over the limit shrink, so it can always be brought back down', async () => {
        await save(accountId, [item('A'), item('B'), item('C')], { maxRecords: 10 });

        const saved = await save(accountId, [], {
          maxRecords: 2,
          deletions: [{ key: 'artist|a', at: daysBefore(1) }],
        });

        expect(saved.filter((record) => record.kind === 'album')).toHaveLength(2);
      });
    });
  });
}
