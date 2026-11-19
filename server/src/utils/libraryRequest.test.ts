import { describe, it, expect } from 'vitest';
import { LIBRARY_SYNC_MAX_DELETIONS, LIBRARY_SYNC_MAX_ITEMS } from '@shared/types';
import { parseLibrarySyncRequest } from './libraryRequest';

function validItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recommendation: { artist: 'Radiohead', album: 'Kid A', year: '2000', reason: 'Cold and warm.' },
    artwork: { artworkUrl: 'https://img.example/kid-a.jpg', year: '2000', appleMusicUrl: null },
    createdAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function parse(body: unknown): ReturnType<typeof parseLibrarySyncRequest> {
  return parseLibrarySyncRequest(body);
}

function itemsOf(result: ReturnType<typeof parseLibrarySyncRequest>): unknown {
  if ('error' in result) throw new Error(result.error);
  return result.request.items;
}

describe('parseLibrarySyncRequest', () => {
  it('accepts a first sync with nothing to send', () => {
    expect(parse({ since: null, items: [], deletions: [] })).toEqual({
      request: { since: null, items: [], deletions: [] },
    });
  });

  it('treats missing lists as empty', () => {
    expect(parse({})).toEqual({ request: { since: null, items: [], deletions: [] } });
  });

  it('keeps an album and its details', () => {
    const item = validItem({
      recommendation: {
        artist: 'Radiohead',
        album: 'Kid A',
        year: '2000',
        reason: 'Cold and warm.',
        genres: ['rock'],
        country: 'GB',
        slug: 'radiohead-kid-a',
        hook: 'A hook.',
        releaseGroupId: 'rg-1',
      },
      feedback: { status: 'own', at: '2026-11-02T10:00:00.000Z' },
    });

    expect(itemsOf(parse({ items: [item] }))).toEqual([item]);
  });

  it('drops fields it does not know', () => {
    const item = validItem({
      owner: 'someone',
      recommendation: {
        artist: 'A',
        album: 'B',
        year: '1',
        reason: 'r',
        secret: 'x',
      },
    });

    const [kept] = itemsOf(parse({ items: [item] })) as Record<string, unknown>[];

    expect(kept).not.toHaveProperty('owner');
    expect(kept.recommendation).not.toHaveProperty('secret');
  });

  it('accepts a cleared rating', () => {
    const item = validItem({ feedback: { status: null, at: '2026-11-02T10:00:00.000Z' } });

    expect(itemsOf(parse({ items: [item] }))).toEqual([item]);
  });

  it('normalises dates', () => {
    const [kept] = itemsOf(
      parse({ items: [validItem({ createdAt: '2026-11-01T10:00:00Z' })] }),
    ) as {
      createdAt: string;
    }[];

    expect(kept.createdAt).toBe('2026-11-01T10:00:00.000Z');
  });

  it('accepts removals', () => {
    const result = parse({
      deletions: [{ key: 'radiohead|kid a', at: '2026-11-03T10:00:00.000Z' }],
    });

    expect(result).toEqual({
      request: {
        since: null,
        items: [],
        deletions: [{ key: 'radiohead|kid a', at: '2026-11-03T10:00:00.000Z' }],
      },
    });
  });

  it.each([
    ['a body that is not an object', 'nope'],
    ['an array body', []],
    ['a since that is not a date', { since: 'yesterday' }],
    ['items that are not a list', { items: {} }],
    ['an album that is not an object', { items: ['x'] }],
    [
      'an album with no artist',
      {
        items: [validItem({ recommendation: { artist: '', album: 'B', year: '1', reason: 'r' } })],
      },
    ],
    [
      'an album with a year that is not text',
      {
        items: [
          validItem({ recommendation: { artist: 'A', album: 'B', year: 1999, reason: 'r' } }),
        ],
      },
    ],
    ['an album with a bad date', { items: [validItem({ createdAt: 'later' })] }],
    [
      'an unknown status',
      { items: [validItem({ feedback: { status: 'loved', at: '2026-11-02T10:00:00.000Z' } })] },
    ],
    ['a verdict with no date', { items: [validItem({ feedback: { status: 'own' } })] }],
    [
      'a cover that is not a web address',
      {
        items: [
          validItem({
            artwork: { artworkUrl: 'javascript:alert(1)', year: null, appleMusicUrl: null },
          }),
        ],
      },
    ],
    [
      'too many genres',
      {
        items: [
          validItem({
            recommendation: {
              artist: 'A',
              album: 'B',
              year: '1',
              reason: 'r',
              genres: Array(21).fill('x'),
            },
          }),
        ],
      },
    ],
    [
      'an over-long reason',
      {
        items: [
          validItem({
            recommendation: { artist: 'A', album: 'B', year: '1', reason: 'x'.repeat(4001) },
          }),
        ],
      },
    ],
    ['a removal with no key', { deletions: [{ at: '2026-11-03T10:00:00.000Z' }] }],
    ['a removal with a bad date', { deletions: [{ key: 'a|b', at: 'x' }] }],
  ])('refuses %s', (_name, body) => {
    expect(parse(body)).toHaveProperty('error');
  });

  it('refuses more albums than one request may carry', () => {
    const items = Array.from({ length: LIBRARY_SYNC_MAX_ITEMS + 1 }, () => validItem());

    expect(parse({ items })).toHaveProperty('error');
  });

  it('refuses more removals than one request may carry', () => {
    const deletions = Array.from({ length: LIBRARY_SYNC_MAX_DELETIONS + 1 }, () => ({
      key: 'a|b',
      at: '2026-11-03T10:00:00.000Z',
    }));

    expect(parse({ deletions })).toHaveProperty('error');
  });
});
