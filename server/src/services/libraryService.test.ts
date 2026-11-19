import { describe, it, expect, vi } from 'vitest';
import { LibraryItem } from '@shared/types';
import { createInMemoryLibraryRepository } from '../repositories/inMemoryLibraryRepository';
import { CURSOR_OVERLAP_MS, syncLibrary } from './libraryService';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function album(name: string): LibraryItem {
  return {
    recommendation: { artist: 'Can', album: name, year: '1971', reason: 'A great fit.' },
    artwork: { artworkUrl: null, year: null, appleMusicUrl: null },
    createdAt: '2026-11-10T10:00:00.000Z',
  };
}

describe('syncLibrary', () => {
  it('returns held albums and removals separately', async () => {
    const library = createInMemoryLibraryRepository();

    const response = await syncLibrary(
      library,
      ACCOUNT,
      {
        since: null,
        items: [album('Tago Mago')],
        deletions: [{ key: 'can|ege bamyasi', at: '2026-11-11T10:00:00.000Z' }],
      },
      NOW,
    );

    expect(response.items).toEqual([album('Tago Mago')]);
    expect(response.deletions).toEqual([
      { key: 'can|ege bamyasi', at: '2026-11-11T10:00:00.000Z' },
    ]);
  });

  it('returns a cursor a little before now, so a save that finished late is not missed', async () => {
    const response = await syncLibrary(
      createInMemoryLibraryRepository(),
      ACCOUNT,
      { since: null, items: [], deletions: [] },
      NOW,
    );

    expect(response.cursor).toBe(new Date(NOW.getTime() - CURSOR_OVERLAP_MS).toISOString());
  });

  it('returns what changed after the cursor it gave before, and not what was older', async () => {
    const library = createInMemoryLibraryRepository();
    const minutesLater = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);
    const first = await syncLibrary(
      library,
      ACCOUNT,
      { since: null, items: [album('Tago Mago')], deletions: [] },
      NOW,
    );
    const second = await syncLibrary(
      library,
      ACCOUNT,
      { since: first.cursor, items: [album('Ege Bamyasi')], deletions: [] },
      minutesLater(1),
    );

    const third = await syncLibrary(
      library,
      ACCOUNT,
      { since: second.cursor, items: [], deletions: [] },
      minutesLater(2),
    );

    expect(second.items.map((item) => item.recommendation.album).sort()).toEqual([
      'Ege Bamyasi',
      'Tago Mago',
    ]);
    expect(third.items.map((item) => item.recommendation.album)).toEqual(['Ege Bamyasi']);
  });

  it('uses the current time when none is given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const response = await syncLibrary(createInMemoryLibraryRepository(), ACCOUNT, {
        since: null,
        items: [],
        deletions: [],
      });

      expect(response.cursor).toBe(new Date(NOW.getTime() - CURSOR_OVERLAP_MS).toISOString());
    } finally {
      vi.useRealTimers();
    }
  });
});
