import { describe, it, expect } from 'vitest';
import { changedAt, LibraryItem, UNRATED_MAX_ENTRIES } from '@shared/types';
import { LibraryRecord } from '../repositories/libraryRepository';
import { expiredKeys, mergeItems, planWrites, REMOVAL_KEPT_DAYS } from './libraryMerge';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function item(album: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    recommendation: { artist: 'Artist', album, year: '1999', reason: 'Good.' },
    artwork: { artworkUrl: null, year: null, appleMusicUrl: null },
    createdAt: daysAgo(10),
    ...overrides,
  };
}

function held(libraryItem: LibraryItem): LibraryRecord {
  return {
    kind: 'album',
    key: `artist|${libraryItem.recommendation.album.toLowerCase()}`,
    item: libraryItem,
    updatedAt: new Date(NOW.getTime() - 1000),
  };
}

function removed(album: string, daysSince: number): LibraryRecord {
  return {
    kind: 'removed',
    key: `artist|${album.toLowerCase()}`,
    removedAt: new Date(daysAgo(daysSince)),
    updatedAt: new Date(NOW.getTime() - 1000),
  };
}

function currentOf(...records: LibraryRecord[]): Map<string, LibraryRecord> {
  return new Map(records.map((record) => [record.key, record]));
}

function plan(
  current: Map<string, LibraryRecord>,
  changes: { items?: LibraryItem[]; deletions?: { key: string; at: string }[] },
): LibraryRecord[] {
  return planWrites(current, {
    items: changes.items ?? [],
    deletions: (changes.deletions ?? []).map(({ key, at }) => ({ key, at: new Date(at) })),
    now: NOW,
  });
}

describe('changedAt', () => {
  it('is when the album was picked until a verdict is given', () => {
    expect(changedAt(item('A', { createdAt: daysAgo(5) }))).toBe(Date.parse(daysAgo(5)));
  });

  it('is the later of the pick and the verdict', () => {
    const rated = item('A', { createdAt: daysAgo(5), feedback: { status: 'own', at: daysAgo(2) } });

    expect(changedAt(rated)).toBe(Date.parse(daysAgo(2)));
  });
});

describe('mergeItems', () => {
  it('takes the verdict given last', () => {
    const older = item('A', { feedback: { status: 'save', at: daysAgo(3) } });
    const newer = item('A', { feedback: { status: 'own', at: daysAgo(1) } });

    expect(mergeItems(older, newer).feedback).toEqual({ status: 'own', at: daysAgo(1) });
    expect(mergeItems(newer, older).feedback).toEqual({ status: 'own', at: daysAgo(1) });
  });

  it('lets a cleared rating beat the rating it cleared', () => {
    const rated = item('A', { feedback: { status: 'own', at: daysAgo(3) } });
    const cleared = item('A', { feedback: { status: null, at: daysAgo(1) } });

    expect(mergeItems(rated, cleared).feedback).toEqual({ status: null, at: daysAgo(1) });
  });

  it('keeps a verdict when the other copy has none', () => {
    const rated = item('A', { feedback: { status: 'own', at: daysAgo(3) } });

    expect(mergeItems(rated, item('A')).feedback?.status).toBe('own');
    expect(mergeItems(item('A'), rated).feedback?.status).toBe('own');
  });

  it('fills in a cover and details the first copy lacks, and keeps what it has', () => {
    const bare = item('A');
    const found = item('A', {
      artwork: { artworkUrl: 'https://img/a.jpg', year: '1999', appleMusicUrl: 'https://music/a' },
      recommendation: {
        artist: 'Artist',
        album: 'A',
        year: '1999',
        reason: 'Other reason.',
        slug: 'artist-a',
        releaseGroupId: 'rg-1',
      },
    });

    const merged = mergeItems(bare, found);

    expect(merged.artwork.artworkUrl).toBe('https://img/a.jpg');
    expect(merged.recommendation.slug).toBe('artist-a');
    expect(merged.recommendation.releaseGroupId).toBe('rg-1');
    expect(merged.recommendation.reason).toBe('Good.');
    expect(mergeItems(found, bare).artwork.artworkUrl).toBe('https://img/a.jpg');
  });

  it('keeps the earlier pick time', () => {
    const merged = mergeItems(
      item('A', { createdAt: daysAgo(2) }),
      item('A', { createdAt: daysAgo(9) }),
    );

    expect(merged.createdAt).toBe(daysAgo(9));
  });
});

describe('planWrites', () => {
  it('stores an album the account has not seen', () => {
    const [record] = plan(currentOf(), { items: [item('A')] });

    expect(record).toMatchObject({ kind: 'album', key: 'artist|a', updatedAt: NOW });
  });

  it('writes nothing when a copy changes nothing, so a repeated request is harmless', () => {
    const existing = held(item('A', { feedback: { status: 'own', at: daysAgo(2) } }));

    expect(
      plan(currentOf(existing), { items: [existing.kind === 'album' ? existing.item : item('A')] }),
    ).toEqual([]);
  });

  it('writes a newer verdict and ignores an older one', () => {
    const existing = held(item('A', { feedback: { status: 'own', at: daysAgo(2) } }));

    const newer = plan(currentOf(existing), {
      items: [item('A', { feedback: { status: 'heard', at: daysAgo(1) } })],
    });
    const older = plan(currentOf(existing), {
      items: [item('A', { feedback: { status: 'save', at: daysAgo(5) } })],
    });

    expect(newer[0]).toMatchObject({ kind: 'album', item: { feedback: { status: 'heard' } } });
    expect(older).toEqual([]);
  });

  it('removes an album that has not changed since it was removed', () => {
    const [record] = plan(currentOf(held(item('A'))), {
      deletions: [{ key: 'artist|a', at: daysAgo(1) }],
    });

    expect(record).toMatchObject({ kind: 'removed', key: 'artist|a' });
  });

  it('keeps an album that was changed after another device removed it', () => {
    const existing = held(item('A', { feedback: { status: 'own', at: daysAgo(1) } }));

    expect(plan(currentOf(existing), { deletions: [{ key: 'artist|a', at: daysAgo(3) }] })).toEqual(
      [],
    );
  });

  it('remembers a removal of an album it has never held, so a stale copy stays out', () => {
    const [record] = plan(currentOf(), { deletions: [{ key: 'artist|a', at: daysAgo(1) }] });

    expect(record).toMatchObject({ kind: 'removed', key: 'artist|a' });
  });

  it('keeps the later of two removals', () => {
    const existing = removed('A', 5);

    const later = plan(currentOf(existing), { deletions: [{ key: 'artist|a', at: daysAgo(2) }] });
    const earlier = plan(currentOf(existing), { deletions: [{ key: 'artist|a', at: daysAgo(9) }] });

    expect(later[0]).toMatchObject({ kind: 'removed', removedAt: new Date(daysAgo(2)) });
    expect(earlier).toEqual([]);
  });

  it('does not bring back a removed album from a copy that is older than the removal', () => {
    expect(
      plan(currentOf(removed('A', 2)), { items: [item('A', { createdAt: daysAgo(10) })] }),
    ).toEqual([]);
  });

  it('brings a removed album back when it was picked or rated after the removal', () => {
    const picked = plan(currentOf(removed('A', 5)), {
      items: [item('A', { createdAt: daysAgo(1) })],
    });
    const rated = plan(currentOf(removed('A', 5)), {
      items: [item('A', { feedback: { status: 'own', at: daysAgo(1) } })],
    });

    expect(picked[0]).toMatchObject({ kind: 'album' });
    expect(rated[0]).toMatchObject({ kind: 'album' });
  });

  it('treats the same album in a different case as one album', () => {
    const [record] = plan(currentOf(held(item('Kid A'))), {
      items: [
        {
          ...item('Kid A'),
          recommendation: { artist: 'ARTIST', album: 'KID A', year: '2000', reason: 'x' },
          feedback: { status: 'own', at: daysAgo(1) },
        },
      ],
    });

    expect(record).toMatchObject({ kind: 'album', key: 'artist|kid a' });
  });

  it('applies several changes in one request', () => {
    const records = plan(currentOf(held(item('A'))), {
      items: [item('B'), item('C')],
      deletions: [{ key: 'artist|a', at: daysAgo(1) }],
    });

    expect(records.map((record) => record.key).sort()).toEqual([
      'artist|a',
      'artist|b',
      'artist|c',
    ]);
  });
});

describe('expiredKeys', () => {
  it('clears out removals once they are older than the limit', () => {
    const records = [
      removed('Old', REMOVAL_KEPT_DAYS + 1),
      removed('Recent', REMOVAL_KEPT_DAYS - 1),
    ];

    expect(expiredKeys(records, NOW)).toEqual(['artist|old']);
  });

  it('clears out unrated picks past the age limit', () => {
    const records = [held(item('Old', { createdAt: daysAgo(100) })), held(item('Fresh'))];

    expect(expiredKeys(records, NOW)).toEqual(['artist|old']);
  });

  it('keeps only the newest unrated picks', () => {
    const picks = Array.from({ length: UNRATED_MAX_ENTRIES + 2 }, (_, index) =>
      held(
        item(`Album ${index}`, {
          createdAt: new Date(NOW.getTime() - index * 60_000).toISOString(),
        }),
      ),
    );

    const expired = expiredKeys(picks, NOW);

    expect(expired.sort()).toEqual(['artist|album 50', 'artist|album 51']);
  });

  it('never clears out a rated album, however old', () => {
    const records = [
      held(
        item('Owned', { createdAt: daysAgo(400), feedback: { status: 'own', at: daysAgo(300) } }),
      ),
    ];

    expect(expiredKeys(records, NOW)).toEqual([]);
  });

  it('treats a cleared rating as unrated', () => {
    const records = [
      held(
        item('Cleared', { createdAt: daysAgo(400), feedback: { status: null, at: daysAgo(300) } }),
      ),
    ];

    expect(expiredKeys(records, NOW)).toEqual(['artist|cleared']);
  });
});
