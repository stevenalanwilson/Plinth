import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LIBRARY_SYNC_MAX_ITEMS,
  LibraryItem,
  LibrarySyncRequest,
  LibrarySyncResponse,
} from '@shared/types';
import { HistoryEntry } from '../types/history';
import { CratePorts, syncCrate } from './crateSync';
import { loadSyncState, newSyncState, recordRemovals, saveSyncState } from './librarySyncState';

const EMAIL = 'person@example.com';
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
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

function empty(cursor = 'cursor-1'): LibrarySyncResponse {
  return { items: [], deletions: [], cursor };
}

function setup(
  history: HistoryEntry[],
  answers: LibrarySyncResponse[] = [empty()],
): {
  ports: CratePorts;
  requests: LibrarySyncRequest[];
  applied: { items: readonly LibraryItem[]; deletions: readonly { key: string; at: string }[] }[];
} {
  const requests: LibrarySyncRequest[] = [];
  const applied: ReturnType<typeof setup>['applied'] = [];
  let call = 0;
  return {
    requests,
    applied,
    ports: {
      getHistory: () => history,
      applyRemote: (items, deletions) => {
        applied.push({ items, deletions });
      },
      send: vi.fn(async (request: LibrarySyncRequest): Promise<LibrarySyncResponse> => {
        requests.push(request);
        const answer = answers[Math.min(call, answers.length - 1)];
        call += 1;
        return answer;
      }),
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('syncCrate', () => {
  it('sends every album on the first sync, asking for everything', async () => {
    const { ports, requests } = setup([entry('A'), entry('B')]);

    await syncCrate(EMAIL, ports);

    expect(requests).toHaveLength(1);
    expect(requests[0].since).toBeNull();
    expect(requests[0].items.map((i) => i.recommendation.album)).toEqual(['A', 'B']);
  });

  it('remembers the cursor and what it sent, and sends nothing the next time', async () => {
    const history = [entry('A')];
    await syncCrate(EMAIL, setup(history, [empty('cursor-1')]).ports);

    const second = setup(history, [empty('cursor-2')]);
    await syncCrate(EMAIL, second.ports);

    expect(second.requests[0]).toEqual({ since: 'cursor-1', items: [], deletions: [] });
    expect(loadSyncState()?.cursor).toBe('cursor-2');
  });

  it('sends only the album whose verdict changed', async () => {
    const history = [entry('A'), entry('B')];
    await syncCrate(EMAIL, setup(history).ports);

    history[1] = entry('B', { feedback: { status: 'own', at: daysAgo(0) } });
    const second = setup(history);
    await syncCrate(EMAIL, second.ports);

    expect(second.requests[0].items.map((i) => i.recommendation.album)).toEqual(['B']);
  });

  it('applies what the account sends back to the crate and counts it as held', async () => {
    const history: HistoryEntry[] = [];
    const first = setup(history, [{ items: [item('Remote')], deletions: [], cursor: 'c1' }]);

    await syncCrate(EMAIL, first.ports);

    expect(first.applied[0].items.map((i) => i.recommendation.album)).toEqual(['Remote']);
    expect(loadSyncState()?.synced).toEqual({ 'can|remote': '' });
  });

  it('sends removals, then stops sending them', async () => {
    const history = [entry('A')];
    await syncCrate(EMAIL, setup(history).ports);
    recordRemovals([entry('Gone')], new Date('2026-11-19T12:00:00.000Z'));

    const second = setup(history);
    await syncCrate(EMAIL, second.ports);
    const third = setup(history);
    await syncCrate(EMAIL, third.ports);

    expect(second.requests[0].deletions).toEqual([
      { key: 'can|gone', at: '2026-11-19T12:00:00.000Z' },
    ]);
    expect(third.requests[0].deletions).toEqual([]);
  });

  it('keeps a removal made while a request was out, to be sent next time', async () => {
    const history = [entry('A')];
    await syncCrate(EMAIL, setup(history).ports);
    const second = setup(history);
    second.ports = {
      ...second.ports,
      send: async (request): Promise<LibrarySyncResponse> => {
        second.requests.push(request);
        recordRemovals([entry('A')], new Date('2026-11-19T12:00:00.000Z'));
        return empty('cursor-2');
      },
    };

    await syncCrate(EMAIL, second.ports);

    expect(loadSyncState()?.removals).toEqual([{ key: 'can|a', at: '2026-11-19T12:00:00.000Z' }]);
  });

  it('sends a big crate a hundred albums at a time, and asks for changes each time', async () => {
    const history = Array.from({ length: LIBRARY_SYNC_MAX_ITEMS * 2 + 5 }, (_, index) =>
      entry(`Album ${index}`),
    );
    const { ports, requests } = setup(history, [empty('c1'), empty('c2'), empty('c3')]);

    await syncCrate(EMAIL, ports);

    expect(requests.map((request) => request.items.length)).toEqual([100, 100, 5]);
    expect(requests.map((request) => request.since)).toEqual([null, 'c1', 'c2']);
    expect(loadSyncState()?.cursor).toBe('c3');
  });

  it('asks again from where the account stopped while it has more to tell, applying each part', async () => {
    const { ports, requests, applied } = setup(
      [],
      [
        { items: [item('A')], deletions: [], cursor: 'c1', more: true },
        { items: [item('B')], deletions: [], cursor: 'c2', more: true },
        { items: [item('C')], deletions: [], cursor: 'c3' },
      ],
    );

    await syncCrate(EMAIL, ports);

    expect(requests.map((request) => request.since)).toEqual([null, 'c1', 'c2']);
    expect(applied.map((part) => part.items.map((i) => i.recommendation.album))).toEqual([
      ['A'],
      ['B'],
      ['C'],
    ]);
    expect(loadSyncState()?.cursor).toBe('c3');
  });

  it('keeps what it got through when a later round fails, and carries on from there', async () => {
    const history = Array.from({ length: LIBRARY_SYNC_MAX_ITEMS + 5 }, (_, index) =>
      entry(`Album ${index}`),
    );
    let call = 0;
    const requests: LibrarySyncRequest[] = [];
    const ports: CratePorts = {
      getHistory: () => history,
      applyRemote: () => undefined,
      send: async (request): Promise<LibrarySyncResponse> => {
        requests.push(request);
        call += 1;
        if (call === 2) throw new Error('offline');
        return empty(`c${call}`);
      },
    };

    await expect(syncCrate(EMAIL, ports)).rejects.toThrow('offline');
    const retry = setup(history);
    await syncCrate(EMAIL, retry.ports);

    expect(retry.requests[0].items).toHaveLength(5);
    expect(retry.requests[0].since).toBe('c1');
  });

  it('sends an album again if the account says it was removed but it was kept here', async () => {
    const history = [entry('A', { feedback: { status: 'own', at: daysAgo(1) } })];
    const first = setup(history, [
      { items: [], deletions: [{ key: 'can|a', at: daysAgo(3) }], cursor: 'c1' },
    ]);
    await syncCrate(EMAIL, first.ports);

    const second = setup(history);
    await syncCrate(EMAIL, second.ports);

    expect(second.requests[0].items.map((i) => i.recommendation.album)).toEqual(['A']);
  });

  it('starts afresh for a different account', async () => {
    const history = [entry('A')];
    await syncCrate('first@example.com', setup(history, [empty('c1')]).ports);

    const other = setup(history);
    await syncCrate('second@example.com', other.ports);

    expect(other.requests[0].since).toBeNull();
    expect(other.requests[0].items).toHaveLength(1);
    expect(loadSyncState()?.email).toBe('second@example.com');
  });

  it('forgets albums the crate no longer has', async () => {
    saveSyncState({ ...newSyncState(EMAIL), synced: { 'can|a': '', 'can|rolled off': '' } });

    await syncCrate(EMAIL, setup([entry('A')]).ports);

    expect(loadSyncState()?.synced).toEqual({ 'can|a': '' });
  });

  it('passes the cancel signal on', async () => {
    const controller = new AbortController();
    const { ports } = setup([]);

    await syncCrate(EMAIL, ports, controller.signal);

    expect(ports.send).toHaveBeenCalledWith(expect.anything(), controller.signal);
  });
});
