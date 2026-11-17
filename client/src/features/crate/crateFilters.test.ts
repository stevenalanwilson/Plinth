import { describe, it, expect } from 'vitest';
import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';
import { countCrate, CRATE_FILTERS, filterCrate, inCrateFilter } from './crateFilters';

function entry(album: string, status?: FeedbackStatus | null): HistoryEntry {
  return {
    id: album,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: { artist: 'Artist', album, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
    ...(status === undefined ? {} : { feedback: { status, at: '2026-11-02T10:00:00.000Z' } }),
  };
}

const LIBRARY = [
  entry('unrated'),
  entry('cleared', null),
  entry('saved', 'save'),
  entry('owned-1', 'own'),
  entry('owned-2', 'own'),
  entry('wanted', 'want-vinyl'),
  entry('heard', 'heard'),
  entry('rejected', 'not-for-me'),
];

function ids(entries: readonly HistoryEntry[]): string[] {
  return entries.map((e) => e.id);
}

describe('CRATE_FILTERS', () => {
  it('starts with All, then each status', () => {
    expect(CRATE_FILTERS).toEqual(['all', 'save', 'own', 'want-vinyl', 'heard', 'not-for-me']);
  });
});

describe('inCrateFilter', () => {
  it('puts everything but "Not for me" in All, unrated picks included', () => {
    expect(inCrateFilter(entry('a'), 'all')).toBe(true);
    expect(inCrateFilter(entry('a', null), 'all')).toBe(true);
    expect(inCrateFilter(entry('a', 'own'), 'all')).toBe(true);
    expect(inCrateFilter(entry('a', 'not-for-me'), 'all')).toBe(false);
  });

  it('matches a status filter only to that status', () => {
    expect(inCrateFilter(entry('a', 'own'), 'own')).toBe(true);
    expect(inCrateFilter(entry('a', 'own'), 'save')).toBe(false);
    expect(inCrateFilter(entry('a'), 'own')).toBe(false);
    expect(inCrateFilter(entry('a', null), 'own')).toBe(false);
  });
});

describe('filterCrate', () => {
  it('keeps the library’s order', () => {
    expect(ids(filterCrate(LIBRARY, 'all'))).toEqual([
      'unrated',
      'cleared',
      'saved',
      'owned-1',
      'owned-2',
      'wanted',
      'heard',
    ]);
  });

  it.each([
    ['save', ['saved']],
    ['own', ['owned-1', 'owned-2']],
    ['want-vinyl', ['wanted']],
    ['heard', ['heard']],
    ['not-for-me', ['rejected']],
  ] as const)('filters to %s', (filter, expected) => {
    expect(ids(filterCrate(LIBRARY, filter))).toEqual(expected);
  });

  it('does not change what it is given', () => {
    const copy = [...LIBRARY];

    filterCrate(LIBRARY, 'own');

    expect(LIBRARY).toEqual(copy);
  });
});

describe('countCrate', () => {
  it('counts each filter the way filterCrate would list it', () => {
    expect(countCrate(LIBRARY)).toEqual({
      all: 7,
      save: 1,
      own: 2,
      'want-vinyl': 1,
      heard: 1,
      'not-for-me': 1,
    });
  });

  it('counts an empty library as zeros', () => {
    expect(countCrate([])).toEqual({
      all: 0,
      save: 0,
      own: 0,
      'want-vinyl': 0,
      heard: 0,
      'not-for-me': 0,
    });
  });
});
