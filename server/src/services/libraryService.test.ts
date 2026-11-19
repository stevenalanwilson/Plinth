import { describe, it, expect, vi } from 'vitest';
import { LibraryItem } from '@shared/types';
import { createInMemoryLibraryRepository } from '../repositories/inMemoryLibraryRepository';
import { LibraryFullError, LibraryRecord } from '../repositories/libraryRepository';
import { CURSOR_OVERLAP_MS, firstPage, syncLibrary } from './libraryService';

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

describe('a crate too large for one answer', () => {
  const limits = { pageSize: 2, maxRecords: 100 };

  function minutesAfterNow(minutes: number): Date {
    return new Date(NOW.getTime() + minutes * 60_000);
  }

  async function saveOneAt(
    library: ReturnType<typeof createInMemoryLibraryRepository>,
    name: string,
    minutes: number,
  ): Promise<void> {
    await syncLibrary(
      library,
      ACCOUNT,
      { since: null, items: [album(name)], deletions: [] },
      minutesAfterNow(minutes),
    );
  }

  it('hands it over a page at a time, each from where the last ended, with nothing twice', async () => {
    const library = createInMemoryLibraryRepository();
    for (const [index, name] of ['A', 'B', 'C', 'D', 'E'].entries()) {
      await saveOneAt(library, name, index);
    }

    const seen: string[] = [];
    let since: string | null = null;
    let rounds = 0;
    let more = true;
    while (more) {
      const response: Awaited<ReturnType<typeof syncLibrary>> = await syncLibrary(
        library,
        ACCOUNT,
        { since, items: [], deletions: [] },
        minutesAfterNow(10),
        limits,
      );
      seen.push(...response.items.map((item) => item.recommendation.album));
      since = response.cursor;
      more = response.more === true;
      rounds += 1;
    }

    expect(seen).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(rounds).toBe(3);
  });

  it('ends with a cursor a little before now, as for any other answer', async () => {
    const library = createInMemoryLibraryRepository();
    await saveOneAt(library, 'A', 0);

    const response = await syncLibrary(
      library,
      ACCOUNT,
      { since: null, items: [], deletions: [] },
      minutesAfterNow(10),
      limits,
    );

    expect(response.more).toBeUndefined();
    expect(response.cursor).toBe(
      new Date(minutesAfterNow(10).getTime() - CURSOR_OVERLAP_MS).toISOString(),
    );
  });

  it('refuses to save more than an account may hold', async () => {
    const library = createInMemoryLibraryRepository();

    await expect(
      syncLibrary(
        library,
        ACCOUNT,
        { since: null, items: [album('A'), album('B')], deletions: [] },
        NOW,
        { pageSize: 500, maxRecords: 1 },
      ),
    ).rejects.toThrow(LibraryFullError);
  });
});

describe('firstPage', () => {
  function record(key: string, minutes: number): LibraryRecord {
    return {
      kind: 'removed',
      key,
      removedAt: NOW,
      updatedAt: new Date(NOW.getTime() + minutes * 60_000),
    };
  }

  it('gives everything when it fits', () => {
    const page = firstPage([record('a', 1), record('b', 0)], 2);

    expect(page.records.map((r) => r.key)).toEqual(['b', 'a']);
    expect(page.resumeAfter).toBeNull();
  });

  it('keeps records saved at the same moment together, even if that goes past the size', () => {
    const page = firstPage([record('a', 0), record('b', 1), record('c', 1), record('d', 2)], 2);

    expect(page.records.map((r) => r.key)).toEqual(['a', 'b', 'c']);
    expect(page.resumeAfter).toEqual(record('b', 1).updatedAt);
  });

  it('says there is nothing more when the moment it had to keep together was the last', () => {
    const page = firstPage([record('a', 0), record('b', 1), record('c', 1)], 2);

    expect(page.records).toHaveLength(3);
    expect(page.resumeAfter).toBeNull();
  });
});
