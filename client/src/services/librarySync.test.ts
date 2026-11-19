import { describe, it, expect } from 'vitest';
import { LibraryItem } from '@shared/types';
import { HistoryEntry } from '../types/history';
import {
  applyServerChanges,
  entryKey,
  fingerprint,
  fromLibraryItem,
  hasUnsyncedChanges,
  toLibraryItem,
  trimSynced,
  unsyncedEntries,
} from './librarySync';

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

function entry(album: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `id-${album}`,
    recommendation: { artist: 'Can', album, year: '1971', reason: 'A great fit.' },
    artworkResponse: { artworkUrl: null, year: '1971', appleMusicUrl: null },
    createdAt: daysAgo(5),
    ...overrides,
  };
}

function item(album: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    recommendation: { artist: 'Can', album, year: '1971', reason: 'A great fit.' },
    artwork: { artworkUrl: null, year: '1971', appleMusicUrl: null },
    createdAt: daysAgo(5),
    ...overrides,
  };
}

function albums(history: readonly HistoryEntry[]): string[] {
  return history.map((e) => e.recommendation.album);
}

describe('entryKey and fingerprint', () => {
  it('names an album as the server does, whatever its case', () => {
    expect(entryKey(entry('Tago Mago'))).toBe('can|tago mago');
    expect(entryKey({ ...entry('TAGO MAGO') })).toBe('can|tago mago');
  });

  it('is empty for an album with no verdict and is the verdict time otherwise', () => {
    expect(fingerprint(entry('A'))).toBe('');
    expect(fingerprint(entry('A', { feedback: { status: 'own', at: daysAgo(1) } }))).toBe(
      daysAgo(1),
    );
  });
});

describe('toLibraryItem and fromLibraryItem', () => {
  it('carries everything but the local id, which an album from the server gets afresh', () => {
    const original = entry('A', { feedback: { status: 'own', at: daysAgo(1) } });

    const back = fromLibraryItem(toLibraryItem(original));

    expect(back).toEqual({ ...original, id: expect.any(String) });
    expect(back.id).not.toBe(original.id);
  });

  it('leaves out a verdict that is not there', () => {
    expect(toLibraryItem(entry('A'))).not.toHaveProperty('feedback');
  });
});

describe('unsyncedEntries and hasUnsyncedChanges', () => {
  it('lists albums the account has not been sent', () => {
    const state = { synced: { 'can|a': '' }, removals: [] };

    expect(albums(unsyncedEntries([entry('A'), entry('B')], state))).toEqual(['B']);
  });

  it('lists an album whose verdict has changed since it was sent', () => {
    const state = { synced: { 'can|a': '' }, removals: [] };
    const rated = entry('A', { feedback: { status: 'own', at: daysAgo(1) } });

    expect(albums(unsyncedEntries([rated], state))).toEqual(['A']);
  });

  it('lists nothing when every album is held as it is', () => {
    const rated = entry('A', { feedback: { status: 'own', at: daysAgo(1) } });
    const state = { synced: { 'can|a': daysAgo(1) }, removals: [] };

    expect(unsyncedEntries([rated], state)).toEqual([]);
    expect(hasUnsyncedChanges([rated], state)).toBe(false);
  });

  it('counts a removal the account has not been told about', () => {
    const state = { synced: {}, removals: [{ key: 'can|a', at: daysAgo(1) }] };

    expect(hasUnsyncedChanges([], state)).toBe(true);
  });
});

describe('trimSynced', () => {
  it('forgets albums the crate no longer has', () => {
    const synced = { 'can|a': '', 'can|gone': '' };

    expect(trimSynced([entry('A')], synced)).toEqual({ 'can|a': '' });
  });
});

describe('applyServerChanges', () => {
  it('adds an album the crate lacks', () => {
    const next = applyServerChanges([entry('A')], [item('B', { createdAt: daysAgo(9) })], []);

    expect(albums(next)).toEqual(['A', 'B']);
  });

  it('keeps the album on show first, even when another is newer', () => {
    const onShow = entry('Old pick', { createdAt: daysAgo(20) });

    const next = applyServerChanges([onShow], [item('Newer', { createdAt: daysAgo(1) })], []);

    expect(albums(next)).toEqual(['Old pick', 'Newer']);
  });

  it('takes a verdict given later on another device', () => {
    const mine = entry('A', { feedback: { status: 'save', at: daysAgo(3) } });

    const next = applyServerChanges(
      [mine],
      [item('A', { feedback: { status: 'own', at: daysAgo(1) } })],
      [],
    );

    expect(next[0].feedback).toEqual({ status: 'own', at: daysAgo(1) });
    expect(next[0].id).toBe(mine.id);
  });

  it('keeps a verdict given later here', () => {
    const mine = entry('A', { feedback: { status: 'own', at: daysAgo(1) } });

    const next = applyServerChanges(
      [mine],
      [item('A', { feedback: { status: 'save', at: daysAgo(3) } })],
      [],
    );

    expect(next[0].feedback?.status).toBe('own');
  });

  it('removes an album the account says was removed after it was last changed here', () => {
    const next = applyServerChanges(
      [entry('A'), entry('B')],
      [],
      [{ key: 'can|a', at: daysAgo(1) }],
    );

    expect(albums(next)).toEqual(['B']);
  });

  it('keeps an album that was changed here after it was removed elsewhere', () => {
    const mine = entry('A', { feedback: { status: 'own', at: daysAgo(1) } });

    const next = applyServerChanges([mine], [], [{ key: 'can|a', at: daysAgo(3) }]);

    expect(albums(next)).toEqual(['A']);
  });

  it('returns the same array when nothing changed, so syncing is not a change to the crate', () => {
    const history = [entry('A'), entry('B', { createdAt: daysAgo(9) })];

    expect(applyServerChanges(history, [item('A'), item('B', { createdAt: daysAgo(9) })], [])).toBe(
      history,
    );
    expect(applyServerChanges(history, [], [])).toBe(history);
  });

  it('does not keep an old unrated album from the account, which the crate would roll off', () => {
    const next = applyServerChanges(
      [entry('A')],
      [item('Ancient', { createdAt: daysAgo(200) })],
      [],
    );

    expect(albums(next)).toEqual(['A']);
  });

  it('keeps an old album that has a verdict', () => {
    const owned = item('Ancient', {
      createdAt: daysAgo(200),
      feedback: { status: 'own', at: daysAgo(150) },
    });

    expect(albums(applyServerChanges([entry('A')], [owned], []))).toEqual(['A', 'Ancient']);
  });

  it('starts an empty crate from the account, newest first', () => {
    const next = applyServerChanges(
      [],
      [item('Older', { createdAt: daysAgo(9) }), item('Newer', { createdAt: daysAgo(2) })],
      [],
    );

    expect(albums(next)).toEqual(['Newer', 'Older']);
  });
});
