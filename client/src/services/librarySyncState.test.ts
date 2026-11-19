import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryEntry } from '../types/history';
import {
  clearSyncState,
  loadSyncState,
  newSyncState,
  recordRemovals,
  saveSyncState,
} from './librarySyncState';

const NOW = new Date('2026-11-19T12:00:00.000Z');

function entry(album: string): HistoryEntry {
  return {
    id: `id-${album}`,
    recommendation: { artist: 'Can', album, year: '1971', reason: 'A great fit.' },
    artworkResponse: { artworkUrl: null, year: '1971', appleMusicUrl: null },
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('the sync state', () => {
  it('is null until one is saved', () => {
    expect(loadSyncState()).toBeNull();
  });

  it('is kept and read back', () => {
    const state = { ...newSyncState('a@example.com'), cursor: 'c1', synced: { 'can|a': '' } };

    saveSyncState(state);

    expect(loadSyncState()).toEqual(state);
  });

  it('is cleared', () => {
    saveSyncState(newSyncState('a@example.com'));

    clearSyncState();

    expect(loadSyncState()).toBeNull();
  });

  it.each(['not json', '{}', '{"email":1}', '[]', 'null'])('reads %s as no state', (stored) => {
    localStorage.setItem('plinth-library-sync', stored);

    expect(loadSyncState()).toBeNull();
  });
});

describe('recordRemovals', () => {
  it('notes a removal, with when, for the next sync', () => {
    saveSyncState(newSyncState('a@example.com'));

    recordRemovals([entry('A'), entry('B')], NOW);

    expect(loadSyncState()?.removals).toEqual([
      { key: 'can|a', at: NOW.toISOString() },
      { key: 'can|b', at: NOW.toISOString() },
    ]);
  });

  it('adds to removals already waiting', () => {
    saveSyncState(newSyncState('a@example.com'));

    recordRemovals([entry('A')], NOW);
    recordRemovals([entry('B')], NOW);

    expect(loadSyncState()?.removals).toHaveLength(2);
  });

  it('remembers nothing in a browser that has never been signed in', () => {
    recordRemovals([entry('A')], NOW);

    expect(loadSyncState()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('does nothing for no albums', () => {
    saveSyncState(newSyncState('a@example.com'));

    recordRemovals([], NOW);

    expect(loadSyncState()?.removals).toEqual([]);
  });
});
