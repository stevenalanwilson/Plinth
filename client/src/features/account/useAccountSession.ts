import { useCallback } from 'react';
import { LibraryDeletion, LibraryItem } from '@shared/types';
import { HistoryEntry } from '../../types/history';
import { clearSyncState } from '../../services/librarySyncState';
import { Account, useAccount } from './useAccount';
import { SyncStatus, UnsyncedCrateError, useLibrarySync } from './useLibrarySync';

interface UseAccountSessionOptions {
  readonly history: readonly HistoryEntry[];
  readonly getHistory: () => readonly HistoryEntry[];
  readonly applyRemote: (
    items: readonly LibraryItem[],
    deletions: readonly LibraryDeletion[],
  ) => void;
  /** Empties the crate on this device. */
  readonly discardCrate: () => void;
}

interface UseAccountSessionReturn {
  readonly account: Account | null;
  readonly isChecking: boolean;
  readonly requestLink: (email: string) => Promise<void>;
  /**
   * Signs out, then takes the crate off this device, since it is kept in the account. If the
   * account is missing changes from this device it rejects with UnsyncedCrateError and does
   * nothing, unless `discardUnsynced` says to go ahead and lose them.
   */
  readonly signOut: (options: { readonly discardUnsynced: boolean }) => Promise<void>;
  /** Deletes the account and what it holds. The crate on this device stays. */
  readonly deleteAccount: () => Promise<void>;
  readonly sync: { readonly status: SyncStatus; readonly hasUnsynced: boolean };
}

/** Who is signed in, and keeping their crate with them: in, out and away. */
export function useAccountSession(options: UseAccountSessionOptions): UseAccountSessionReturn {
  const { account, isChecking, requestLink, signOut, deleteAccount, refresh } = useAccount();
  const { status, hasUnsynced, syncNow } = useLibrarySync({
    email: account?.email ?? null,
    history: options.history,
    getHistory: options.getHistory,
    applyRemote: options.applyRemote,
    discardCrate: options.discardCrate,
    onNotSignedIn: () => void refresh(),
  });
  const { discardCrate } = options;

  const signOutAndLeaveCrate = useCallback(
    async ({ discardUnsynced }: { readonly discardUnsynced: boolean }): Promise<void> => {
      // Saved first, so that nothing is taken off this device that the account doesn't hold.
      if (!discardUnsynced && !(await syncNow())) throw new UnsyncedCrateError();
      await signOut();
      discardCrate();
      clearSyncState();
    },
    [syncNow, signOut, discardCrate],
  );

  const deleteAccountAndForget = useCallback(async (): Promise<void> => {
    await deleteAccount();
    // The crate is staying, but it isn't being kept with anyone now. A later sign-in starts it
    // afresh, as it would for a crate that had never been saved.
    clearSyncState();
  }, [deleteAccount]);

  return {
    account,
    isChecking,
    requestLink,
    signOut: signOutAndLeaveCrate,
    deleteAccount: deleteAccountAndForget,
    sync: { status, hasUnsynced },
  };
}
