import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { HistoryEntry } from '../../types/history';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchAccount: vi.fn(),
  requestSignInLink: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
  syncLibrary: vi.fn(),
}));

import {
  ApiError,
  deleteAccount as apiDeleteAccount,
  fetchAccount,
  signOut as apiSignOut,
  syncLibrary,
} from '../../services/apiClient';
import { loadSyncState } from '../../services/librarySyncState';
import { UnsyncedCrateError } from './useLibrarySync';
import { useAccountSession } from './useAccountSession';

const mockFetchAccount = vi.mocked(fetchAccount);
const mockSignOut = vi.mocked(apiSignOut);
const mockDelete = vi.mocked(apiDeleteAccount);
const mockSync = vi.mocked(syncLibrary);

function entry(album: string): HistoryEntry {
  return {
    id: `id-${album}`,
    recommendation: { artist: 'Can', album, year: '1971', reason: 'A great fit.' },
    artworkResponse: { artworkUrl: null, year: '1971', appleMusicUrl: null },
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function setup(history: HistoryEntry[] = [entry('A')]): {
  discardCrate: ReturnType<typeof vi.fn>;
  hook: ReturnType<typeof renderHook<ReturnType<typeof useAccountSession>, undefined>>;
} {
  const discardCrate = vi.fn();
  const hook = renderHook(() =>
    useAccountSession({
      history,
      getHistory: () => history,
      applyRemote: vi.fn(),
      discardCrate: discardCrate as never,
    }),
  );
  return { discardCrate, hook };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockFetchAccount.mockResolvedValue({ account: { email: 'person@example.com' } });
  mockSignOut.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockSync.mockResolvedValue({ items: [], deletions: [], cursor: 'c1' });
});

async function signedIn(hook: ReturnType<typeof setup>['hook']): Promise<void> {
  await waitFor(() => expect(hook.result.current.account).not.toBeNull());
  await waitFor(() => expect(hook.result.current.sync.status).toBe('idle'));
}

describe('useAccountSession', () => {
  it('saves the crate to the account it is signed in to', async () => {
    const { hook } = setup();

    await signedIn(hook);

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(hook.result.current.sync).toEqual({ status: 'idle', hasUnsynced: false });
  });

  describe('signing out', () => {
    it('saves the crate, signs out, then takes the crate off this device', async () => {
      const { hook, discardCrate } = setup();
      await signedIn(hook);
      mockSync.mockClear();

      await act(() => hook.result.current.signOut({ discardUnsynced: false }));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(discardCrate).toHaveBeenCalledTimes(1);
      expect(loadSyncState()).toBeNull();
      expect(hook.result.current.account).toBeNull();
    });

    it('saves what has changed before signing out', async () => {
      let history = [entry('A')];
      const discardCrate = vi.fn();
      const hook = renderHook(() =>
        useAccountSession({
          history,
          getHistory: () => history,
          applyRemote: vi.fn(),
          discardCrate: discardCrate as never,
        }),
      );
      await signedIn(hook);
      mockSync.mockClear();
      history = [entry('A'), entry('B')];

      await act(() => hook.result.current.signOut({ discardUnsynced: false }));

      expect(mockSync).toHaveBeenCalled();
      expect(mockSync.mock.calls[0][0].items.map((item) => item.recommendation.album)).toEqual([
        'B',
      ]);
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('does nothing, and says why, when the changes cannot be saved', async () => {
      const { hook, discardCrate } = setup();
      await signedIn(hook);
      mockSync.mockRejectedValue(new Error('offline'));
      // Nothing is known about what the account holds, so there is something to save.
      localStorage.clear();

      let failure: unknown;
      await act(async () => {
        failure = await hook.result.current.signOut({ discardUnsynced: false }).then(
          () => undefined,
          (error: unknown) => error,
        );
      });

      expect(failure).toBeInstanceOf(UnsyncedCrateError);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(discardCrate).not.toHaveBeenCalled();
      expect(hook.result.current.account).not.toBeNull();
    });

    it('goes ahead without saving when told to lose the changes', async () => {
      const { hook, discardCrate } = setup();
      await signedIn(hook);
      mockSync.mockClear();
      mockSync.mockRejectedValue(new Error('offline'));

      await act(() => hook.result.current.signOut({ discardUnsynced: true }));

      expect(mockSync).not.toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      expect(discardCrate).toHaveBeenCalled();
    });

    it('keeps the crate when the server cannot sign the device out', async () => {
      const { hook, discardCrate } = setup();
      await signedIn(hook);
      mockSignOut.mockRejectedValue(new Error('Something went wrong signing out.'));

      await act(async () => {
        await expect(hook.result.current.signOut({ discardUnsynced: false })).rejects.toThrow(
          'Something went wrong signing out.',
        );
      });

      expect(discardCrate).not.toHaveBeenCalled();
      expect(loadSyncState()).not.toBeNull();
    });

    it('signs out an empty crate without a fuss', async () => {
      const { hook } = setup([]);
      await signedIn(hook);

      await act(() => hook.result.current.signOut({ discardUnsynced: false }));

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('deleting the account', () => {
    it('leaves the crate on this device, but no longer keeps it with anyone', async () => {
      const { hook, discardCrate } = setup();
      await signedIn(hook);
      expect(loadSyncState()).not.toBeNull();

      await act(() => hook.result.current.deleteAccount());

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(discardCrate).not.toHaveBeenCalled();
      expect(loadSyncState()).toBeNull();
    });

    it('keeps everything when the account could not be deleted', async () => {
      const { hook } = setup();
      await signedIn(hook);
      mockDelete.mockRejectedValue(new Error("Couldn't delete the account."));

      await act(async () => {
        await expect(hook.result.current.deleteAccount()).rejects.toThrow();
      });

      expect(loadSyncState()).not.toBeNull();
    });
  });

  it('finds out again who is signed in when the server says nobody is', async () => {
    mockSync.mockRejectedValue(new ApiError("You're not signed in.", 403));
    mockFetchAccount
      .mockResolvedValueOnce({ account: { email: 'person@example.com' } })
      .mockResolvedValue({ account: null });

    const { hook } = setup();

    await waitFor(() => expect(hook.result.current.account).toBeNull());
    expect(mockFetchAccount).toHaveBeenCalledTimes(2);
  });
});
