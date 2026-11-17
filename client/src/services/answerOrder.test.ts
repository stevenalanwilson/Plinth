import { describe, it, expect } from 'vitest';
import { HistoryEntry } from '../types/history';
import { newestAnswerFirst } from './answerOrder';

function entry(album: string, at: string | null): HistoryEntry {
  return {
    id: album,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: { artist: 'Artist', album, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
    ...(at ? { feedback: { status: 'want-vinyl' as const, at } } : {}),
  };
}

function ids(entries: readonly HistoryEntry[]): string[] {
  return entries.map((e) => e.id);
}

describe('newestAnswerFirst', () => {
  it('puts the album added to the list most recently first', () => {
    const list = [
      entry('first', '2026-11-02T10:00:00.000Z'),
      entry('third', '2026-11-04T10:00:00.000Z'),
      entry('second', '2026-11-03T10:00:00.000Z'),
    ];

    expect(ids(newestAnswerFirst(list))).toEqual(['third', 'second', 'first']);
  });

  it('orders by when it was added, not by when it was picked', () => {
    const pickedLongAgoAddedToday = {
      ...entry('late-add', '2026-11-17T10:00:00.000Z'),
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const pickedTodayAddedBefore = {
      ...entry('early-add', '2026-11-10T10:00:00.000Z'),
      createdAt: '2026-11-17T00:00:00.000Z',
    };

    expect(ids(newestAnswerFirst([pickedTodayAddedBefore, pickedLongAgoAddedToday]))).toEqual([
      'late-add',
      'early-add',
    ]);
  });

  it('compares times, not text', () => {
    const offset = entry('offset', '2099-01-01T00:30:00+01:00');
    const utc = entry('utc', '2099-01-01T00:00:00Z');

    // 00:30 at +01:00 is 23:30 UTC the day before, so the UTC one is later.
    expect(ids(newestAnswerFirst([offset, utc]))).toEqual(['utc', 'offset']);
  });

  it('keeps the order of albums answered at the same moment', () => {
    const at = '2026-11-02T10:00:00.000Z';

    expect(ids(newestAnswerFirst([entry('a', at), entry('b', at), entry('c', at)]))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('puts an album with no usable time last', () => {
    const list = [entry('none', null), entry('dated', '2026-11-02T10:00:00.000Z')];

    expect(ids(newestAnswerFirst(list))).toEqual(['dated', 'none']);
  });

  it('does not change what it is given', () => {
    const list = [entry('a', '2026-11-02T10:00:00.000Z'), entry('b', '2026-11-03T10:00:00.000Z')];

    newestAnswerFirst(list);

    expect(ids(list)).toEqual(['a', 'b']);
  });
});
