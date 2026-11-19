import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { LibrarySyncRequest, LibrarySyncResponse } from '@shared/types';
import { HistoryEntry } from '../../types/history';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  syncLibrary: vi.fn(),
}));

import { ApiError, syncLibrary } from '../../services/apiClient';
import { loadSyncState, newSyncState, saveSyncState } from '../../services/librarySyncState';
import { useLibrarySync } from './useLibrarySync';

const mockSync = vi.mocked(syncLibrary);
const EMAIL = 'person@example.com';

function entry(album: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `id-${album}`,
    recommendation: { artist: 'Can', album, year: '1971', reason: 'A great fit.' },
    artworkResponse: { artworkUrl: null, year: '1971', appleMusicUrl: null },
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function answer(cursor = 'c1'): LibrarySyncResponse {
  return { items: [], deletions: [], cursor };
}

interface Harness {
  history: HistoryEntry[];
  applyRemote: ReturnType<typeof vi.fn>;
  discardCrate: ReturnType<typeof vi.fn>;
  onNotSignedIn: ReturnType<typeof vi.fn>;
}

function setup(
  history: HistoryEntry[],
  email: string | null = EMAIL,
): {
  harness: Harness;
  hook: ReturnType<
    typeof renderHook<
      ReturnType<typeof useLibrarySync>,
      { email: string | null; history: HistoryEntry[] }
    >
  >;
} {
  const harness: Harness = {
    history,
    applyRemote: vi.fn(),
    discardCrate: vi.fn(),
    onNotSignedIn: vi.fn(),
  };
  const hook = renderHook(
    (props: { email: string | null; history: HistoryEntry[] }) =>
      useLibrarySync({
        email: props.email,
        history: props.history,
        getHistory: () => harness.history,
        applyRemote: harness.applyRemote as never,
        discardCrate: harness.discardCrate as never,
        onNotSignedIn: harness.onNotSignedIn as never,
      }),
    { initialProps: { email, history } },
  );
  return { harness, hook };
}

function sentAlbums(call: number): string[] {
  return (mockSync.mock.calls[call][0] as LibrarySyncRequest).items.map(
    (item) => item.recommendation.album,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockSync.mockResolvedValue(answer());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLibrarySync', () => {
  it('saves the crate as soon as the browser is signed in', async () => {
    const { hook } = setup([entry('A'), entry('B')]);

    await waitFor(() => expect(hook.result.current.status).toBe('idle'));

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(sentAlbums(0)).toEqual(['A', 'B']);
    expect(hook.result.current.hasUnsynced).toBe(false);
  });

  it('does nothing while signed out', async () => {
    const { hook } = setup([entry('A')], null);

    await act(async () => undefined);

    expect(mockSync).not.toHaveBeenCalled();
    expect(hook.result.current.hasUnsynced).toBe(false);
  });

  it('syncs once the browser signs in', async () => {
    const { hook } = setup([entry('A')], null);

    hook.rerender({ email: EMAIL, history: [entry('A')] });

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
  });

  it('shows the work in progress, then done', async () => {
    let finish: (value: LibrarySyncResponse) => void = () => undefined;
    mockSync.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { hook } = setup([entry('A')]);

    await waitFor(() => expect(hook.result.current.status).toBe('syncing'));
    await act(async () => finish(answer()));

    expect(hook.result.current.status).toBe('idle');
  });

  it('says it failed, and that something is unsaved', async () => {
    mockSync.mockRejectedValue(new Error('offline'));

    const { hook } = setup([entry('A')]);

    await waitFor(() => expect(hook.result.current.status).toBe('failed'));
    expect(hook.result.current.hasUnsynced).toBe(true);
  });

  it('tells whoever shows who is signed in when the server says it is nobody', async () => {
    mockSync.mockRejectedValue(new ApiError("You're not signed in.", 403));

    const { harness } = setup([entry('A')]);

    await waitFor(() => expect(harness.onNotSignedIn).toHaveBeenCalled());
  });

  it('does not do that for other failures', async () => {
    mockSync.mockRejectedValue(new ApiError('Boom', 500));

    const { harness, hook } = setup([entry('A')]);

    await waitFor(() => expect(hook.result.current.status).toBe('failed'));
    expect(harness.onNotSignedIn).not.toHaveBeenCalled();
  });

  it('hands what the account sent to the crate', async () => {
    mockSync.mockResolvedValue({
      items: [
        {
          recommendation: { artist: 'Can', album: 'Remote', year: '1971', reason: 'r' },
          artwork: { artworkUrl: null, year: null, appleMusicUrl: null },
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      deletions: [],
      cursor: 'c1',
    });

    const { harness } = setup([]);

    await waitFor(() => expect(harness.applyRemote).toHaveBeenCalled());
    expect(harness.applyRemote.mock.calls[0][0]).toHaveLength(1);
  });

  describe('saving a change', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('saves a change a moment after it is made, as one request however many were made', async () => {
      const first = [entry('A')];
      const { harness, hook } = setup(first);
      await waitFor(() => expect(hook.result.current.status).toBe('idle'));
      mockSync.mockClear();

      const rated = entry('A', { feedback: { status: 'own', at: new Date().toISOString() } });
      harness.history = [rated, entry('B')];
      hook.rerender({ email: EMAIL, history: harness.history });
      expect(hook.result.current.hasUnsynced).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(mockSync).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(mockSync).toHaveBeenCalledTimes(1);
      expect(sentAlbums(0).sort()).toEqual(['A', 'B']);
      expect(hook.result.current.hasUnsynced).toBe(false);
    });

    it('does not ask again when nothing has changed', async () => {
      const { hook } = setup([entry('A')]);
      await waitFor(() => expect(hook.result.current.status).toBe('idle'));
      mockSync.mockClear();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(mockSync).not.toHaveBeenCalled();
    });

    it('asks now and then whether another device has changed the crate', async () => {
      const { hook } = setup([entry('A')]);
      await waitFor(() => expect(hook.result.current.status).toBe('idle'));
      mockSync.mockClear();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });

      expect(mockSync).toHaveBeenCalledTimes(1);
      expect(sentAlbums(0)).toEqual([]);
    });

    it('asks when the window is clicked back into, which a visible page does not report as a return', async () => {
      const { hook } = setup([entry('A')]);
      await waitFor(() => expect(hook.result.current.status).toBe('idle'));
      mockSync.mockClear();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
        window.dispatchEvent(new Event('focus'));
      });

      expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('asks again when the connection comes back, but not straight after asking', async () => {
      const { hook } = setup([entry('A')]);
      await waitFor(() => expect(hook.result.current.status).toBe('idle'));
      mockSync.mockClear();

      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
      expect(mockSync).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
        window.dispatchEvent(new Event('online'));
      });
      expect(mockSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncNow', () => {
    it('resolves true once the account holds everything', async () => {
      const { hook } = setup([entry('A')]);

      let saved = false;
      await act(async () => {
        saved = await hook.result.current.syncNow();
      });

      expect(saved).toBe(true);
    });

    it('resolves false when the save fails', async () => {
      mockSync.mockRejectedValue(new Error('offline'));
      const { hook } = setup([entry('A')]);

      let saved = true;
      await act(async () => {
        saved = await hook.result.current.syncNow();
      });

      expect(saved).toBe(false);
    });

    it('resolves false when signed out', async () => {
      const { hook } = setup([entry('A')], null);

      let saved = true;
      await act(async () => {
        saved = await hook.result.current.syncNow();
      });

      expect(saved).toBe(false);
    });

    it('runs one more round for a change made while a sync was out, rather than a second at once', async () => {
      let releaseFirst: (value: LibrarySyncResponse) => void = () => undefined;
      mockSync.mockReturnValueOnce(new Promise((resolve) => (releaseFirst = resolve)));
      const { harness, hook } = setup([entry('A')]);
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));

      harness.history = [entry('A'), entry('B')];
      const waiting = hook.result.current.syncNow();
      expect(mockSync).toHaveBeenCalledTimes(1);
      await act(async () => releaseFirst(answer('c1')));
      const saved = await waiting;

      expect(mockSync).toHaveBeenCalledTimes(2);
      expect(sentAlbums(1)).toEqual(['B']);
      expect(saved).toBe(true);
    });
  });

  describe('a different account', () => {
    it('drops the crate that belonged to the last account, and starts that of this one afresh', async () => {
      saveSyncState({ ...newSyncState('old@example.com'), cursor: 'old-cursor' });
      const { harness } = setup([entry('Old album')]);

      await waitFor(() => expect(harness.discardCrate).toHaveBeenCalledTimes(1));

      expect(loadSyncState()?.email).toBe(EMAIL);
      expect((mockSync.mock.calls[0][0] as LibrarySyncRequest).since).toBeNull();
    });

    it('does not drop a crate that belongs to this account', async () => {
      saveSyncState({ ...newSyncState(EMAIL), cursor: 'c0' });
      const { harness } = setup([entry('A')]);

      await waitFor(() => expect(mockSync).toHaveBeenCalled());

      expect(harness.discardCrate).not.toHaveBeenCalled();
      expect((mockSync.mock.calls[0][0] as LibrarySyncRequest).since).toBe('c0');
    });
  });
});
