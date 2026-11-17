import { describe, it, expect } from 'vitest';
import { HistoryEntry } from '../types/history';
import { FeedbackStatus } from '../types/feedback';
import { buildTaste } from './taste';

function entry(
  album: string,
  status: FeedbackStatus | null | undefined,
  at = '2026-11-02T10:00:00.000Z',
): HistoryEntry {
  return {
    id: album,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: { artist: 'Artist', album, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
    ...(status === undefined ? {} : { feedback: { status, at } }),
  };
}

describe('buildTaste', () => {
  it('has nothing to say when no album has been answered', () => {
    expect(buildTaste([])).toBeUndefined();
    expect(buildTaste([entry('Unrated', undefined), entry('Cleared', null)])).toBeUndefined();
  });

  it('writes albums as "Artist – Album"', () => {
    expect(buildTaste([entry('Jeopardy', 'own')])?.avoid).toEqual(['Artist – Jeopardy']);
  });

  it('keeps every answered album out of picks, whatever the answer', () => {
    const taste = buildTaste([
      entry('Saved', 'save'),
      entry('Owned', 'own'),
      entry('Wanted', 'want-vinyl'),
      entry('Heard', 'heard'),
      entry('Rejected', 'not-for-me'),
    ]);

    expect(taste?.avoid).toHaveLength(5);
  });

  it('leaves out albums that were never answered, or whose answer was cleared', () => {
    const taste = buildTaste([
      entry('Owned', 'own'),
      entry('Unrated', undefined),
      entry('Cleared', null),
    ]);

    expect(taste?.avoid).toEqual(['Artist – Owned']);
  });

  it('likes what the listener owns, wants or saved', () => {
    const taste = buildTaste([
      entry('Saved', 'save'),
      entry('Owned', 'own'),
      entry('Wanted', 'want-vinyl'),
      entry('Heard', 'heard'),
      entry('Rejected', 'not-for-me'),
    ]);

    expect([...(taste?.liked ?? [])].sort()).toEqual([
      'Artist – Owned',
      'Artist – Saved',
      'Artist – Wanted',
    ]);
  });

  it('does not count having heard an album as liking or disliking it', () => {
    const taste = buildTaste([entry('Heard', 'heard')]);

    expect(taste).toEqual({ avoid: ['Artist – Heard'], liked: [], disliked: [] });
  });

  it('dislikes what the listener said is not for them', () => {
    const taste = buildTaste([entry('Rejected', 'not-for-me'), entry('Owned', 'own')]);

    expect(taste?.disliked).toEqual(['Artist – Rejected']);
  });

  it('puts the newest answers first', () => {
    const taste = buildTaste([
      entry('Old', 'own', '2026-01-01T10:00:00.000Z'),
      entry('New', 'own', '2026-11-01T10:00:00.000Z'),
      entry('Middle', 'own', '2026-06-01T10:00:00.000Z'),
    ]);

    expect(taste?.avoid).toEqual(['Artist – New', 'Artist – Middle', 'Artist – Old']);
    expect(taste?.liked).toEqual(['Artist – New', 'Artist – Middle', 'Artist – Old']);
  });

  it('keeps the 12 newest likes and dislikes, so the lean follows current taste', () => {
    const day = (n: number): string => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
    const library = [
      ...Array.from({ length: 20 }, (_, i) => entry(`Liked ${i}`, 'own', day(i))),
      ...Array.from({ length: 20 }, (_, i) => entry(`Disliked ${i}`, 'not-for-me', day(i))),
    ];

    const taste = buildTaste(library);

    expect(taste?.liked).toHaveLength(12);
    expect(taste?.liked[0]).toBe('Artist – Liked 19');
    expect(taste?.liked[11]).toBe('Artist – Liked 8');
    expect(taste?.disliked).toHaveLength(12);
    expect(taste?.disliked[0]).toBe('Artist – Disliked 19');
  });

  it('keeps up to 500 albums out of picks, newest first', () => {
    const day = (n: number): string => new Date(Date.UTC(2020, 0, 1) + n * 60_000).toISOString();
    const library = Array.from({ length: 520 }, (_, i) => entry(`Album ${i}`, 'heard', day(i)));

    const taste = buildTaste(library);

    expect(taste?.avoid).toHaveLength(500);
    expect(taste?.avoid[0]).toBe('Artist – Album 519');
    expect(taste?.avoid).not.toContain('Artist – Album 0');
  });

  it('does not change the library it is given', () => {
    const library = [entry('Old', 'own', '2026-01-01T10:00:00.000Z'), entry('New', 'own')];

    buildTaste(library);

    expect(library.map((e) => e.id)).toEqual(['Old', 'New']);
  });
});
