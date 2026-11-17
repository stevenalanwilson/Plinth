import { describe, it, expect } from 'vitest';
import { HistoryEntry } from '../types/history';
import { FeedbackStatus } from '../types/feedback';
import {
  isRated,
  pruneLibrary,
  UNRATED_MAX_AGE_DAYS,
  UNRATED_MAX_ENTRIES,
} from './libraryRetention';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

function entry(name: string, createdDaysAgo: number, status?: FeedbackStatus | null): HistoryEntry {
  return {
    id: name,
    createdAt: daysAgo(createdDaysAgo),
    recommendation: { artist: 'Artist', album: name, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
    ...(status === undefined ? {} : { feedback: { status, at: daysAgo(createdDaysAgo) } }),
  };
}

function ids(entries: readonly HistoryEntry[]): string[] {
  return entries.map((e) => e.id);
}

describe('isRated', () => {
  it('is true for any status', () => {
    expect(isRated(entry('a', 1, 'own'))).toBe(true);
    expect(isRated(entry('a', 1, 'not-for-me'))).toBe(true);
  });

  it('is false with no feedback, and for a cleared rating', () => {
    expect(isRated(entry('a', 1))).toBe(false);
    expect(isRated(entry('a', 1, null))).toBe(false);
  });
});

describe('pruneLibrary', () => {
  it('drops unrated picks older than 90 days', () => {
    const library = [entry('new', 1), entry('edge', UNRATED_MAX_AGE_DAYS - 1), entry('old', 91)];

    expect(ids(pruneLibrary(library, NOW))).toEqual(['new', 'edge']);
  });

  it('keeps a rated album however old it is', () => {
    const library = [entry('owned', 400, 'own'), entry('wanted', 1000, 'want-vinyl')];

    expect(ids(pruneLibrary(library, NOW))).toEqual(['owned', 'wanted']);
  });

  it('keeps every status, including not-for-me and heard', () => {
    const library = (['save', 'own', 'want-vinyl', 'heard', 'not-for-me'] as const).map((status) =>
      entry(status, 500, status),
    );

    expect(pruneLibrary(library, NOW)).toHaveLength(5);
  });

  it('keeps only the newest 50 unrated picks', () => {
    const library = Array.from({ length: 60 }, (_, i) => entry(`pick-${i}`, 1));

    const kept = pruneLibrary(library, NOW);

    expect(kept).toHaveLength(UNRATED_MAX_ENTRIES);
    expect(kept[0].id).toBe('pick-0');
    expect(kept.at(-1)?.id).toBe('pick-49');
  });

  it('does not count rated albums towards the 50', () => {
    const library = [
      ...Array.from({ length: 10 }, (_, i) => entry(`owned-${i}`, 5, 'own')),
      ...Array.from({ length: 55 }, (_, i) => entry(`pick-${i}`, 1)),
    ];

    const kept = pruneLibrary(library, NOW);

    expect(kept.filter(isRated)).toHaveLength(10);
    expect(kept.filter((e) => !isRated(e))).toHaveLength(50);
  });

  it('keeps a rated album that sits beyond the 50th place', () => {
    const library = [
      ...Array.from({ length: 50 }, (_, i) => entry(`pick-${i}`, 1)),
      entry('owned-long-ago', 200, 'own'),
    ];

    expect(ids(pruneLibrary(library, NOW))).toContain('owned-long-ago');
  });

  it('treats a cleared rating as an ordinary pick', () => {
    const library = [entry('cleared-old', 200, null), entry('cleared-new', 2, null)];

    expect(ids(pruneLibrary(library, NOW))).toEqual(['cleared-new']);
  });

  it('keeps the order it was given', () => {
    const library = [entry('b', 5), entry('a', 1, 'own'), entry('c', 3)];

    expect(ids(pruneLibrary(library, NOW))).toEqual(['b', 'a', 'c']);
  });

  it('drops an unrated pick whose date does not parse, but keeps a rated one', () => {
    const broken = { ...entry('broken', 1), createdAt: 'not a date' };
    const brokenRated = { ...entry('broken-rated', 1, 'own'), createdAt: 'not a date' };

    expect(ids(pruneLibrary([broken, brokenRated], NOW))).toEqual(['broken-rated']);
  });

  it('does not change what it is given', () => {
    const library = [entry('new', 1), entry('old', 200)];

    pruneLibrary(library, NOW);

    expect(library).toHaveLength(2);
  });
});
