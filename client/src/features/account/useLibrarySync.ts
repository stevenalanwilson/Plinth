import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LibraryDeletion, LibraryItem } from '@shared/types';
import { HistoryEntry } from '../../types/history';
import { ApiError, syncLibrary } from '../../services/apiClient';
import { syncCrate } from '../../services/crateSync';
import { hasUnsyncedChanges } from '../../services/librarySync';
import { clearSyncState, loadSyncState } from '../../services/librarySyncState';

export type SyncStatus = 'idle' | 'syncing' | 'failed';

/** Thrown to stop signing out while the account is still missing changes from this device. */
export class UnsyncedCrateError extends Error {
  constructor() {
    super('Some changes to your crate have not been saved to your account yet.');
    this.name = 'UnsyncedCrateError';
  }
}

// After the crate changes, a short wait so a run of changes (rating several albums) is one save.
const SAVE_DELAY_MS = 1_500;
// How often a page left open asks whether another device has changed the crate.
const CHECK_INTERVAL_MS = 60_000;
// Coming back to the page asks again, but not if it has only just asked.
const MIN_CHECK_GAP_MS = 10_000;

interface UseLibrarySyncOptions {
  /** Who this browser is signed in as, or null. Nothing is synced without it. */
  readonly email: string | null;
  /** The crate, so a change to it is noticed. */
  readonly history: readonly HistoryEntry[];
  readonly getHistory: () => readonly HistoryEntry[];
  readonly applyRemote: (
    items: readonly LibraryItem[],
    deletions: readonly LibraryDeletion[],
  ) => void;
  /** Empties the crate on this device, for when it belongs to a different account. */
  readonly discardCrate: () => void;
  /** The account says this browser isn't signed in, so whoever shows that should find out. */
  readonly onNotSignedIn: () => void;
}

interface UseLibrarySyncReturn {
  readonly status: SyncStatus;
  /** True while the account is missing something from this device. */
  readonly hasUnsynced: boolean;
  /** Saves now. Resolves true only when the account holds everything this device has. */
  readonly syncNow: () => Promise<boolean>;
}

/**
 * Keeps the crate and the signed-in account together: once when the browser signs in, when the
 * crate changes, when the page comes back into view or the connection returns, and now and then.
 * One sync runs at a time, and a request that comes in during one makes it go round again.
 */
export function useLibrarySync(options: UseLibrarySyncOptions): UseLibrarySyncReturn {
  const { email, history } = options;
  const latest = useRef(options);
  latest.current = options;

  const [status, setStatus] = useState<SyncStatus>('idle');
  // Counted up when a sync ends, so what is shown as unsaved is worked out again.
  const [finished, setFinished] = useState(0);
  const running = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const lastEnded = useRef(0);

  const hasPending = useCallback((): boolean => {
    const { email: who, getHistory } = latest.current;
    if (!who) return false;
    const state = loadSyncState();
    if (!state || state.email !== who) return true;
    return hasUnsyncedChanges(getHistory(), state);
  }, []);

  const sync = useCallback((): Promise<boolean> => {
    const who = latest.current.email;
    if (!who) return Promise.resolve(false);
    if (running.current) {
      again.current = true;
      return running.current;
    }

    const run = (async (): Promise<boolean> => {
      try {
        do {
          again.current = false;
          setStatus('syncing');
          await syncCrate(who, {
            getHistory: () => latest.current.getHistory(),
            applyRemote: (items, deletions) => latest.current.applyRemote(items, deletions),
            send: syncLibrary,
          });
        } while (again.current);
        setStatus('idle');
        return true;
      } catch (error) {
        setStatus('failed');
        if (error instanceof ApiError && error.status === 403) latest.current.onNotSignedIn();
        return false;
      } finally {
        running.current = null;
        lastEnded.current = Date.now();
        setFinished((count) => count + 1);
      }
    })();
    running.current = run;
    return run;
  }, []);

  // The first sync of a signed-in browser, or one that has just signed in. A crate that was kept
  // with a different account isn't carried over to this one.
  useEffect(() => {
    if (!email) return;
    const state = loadSyncState();
    if (state && state.email !== email) {
      latest.current.discardCrate();
      clearSyncState();
    }
    void sync();
  }, [email, sync]);

  // Save a change shortly after it is made. Only when there is one: a sync that brought nothing
  // new leaves the crate as it was and so doesn't set this off again.
  useEffect(() => {
    if (!email || !hasPending()) return;
    // Checked again when the wait is up: what was pending may have been saved in the meantime.
    const timer = setTimeout(() => {
      if (hasPending()) void sync();
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [email, history, sync, hasPending]);

  // Hear about changes made on other devices.
  useEffect(() => {
    if (!email) return;
    const check = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastEnded.current < MIN_CHECK_GAP_MS) return;
      void sync();
    };
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, [email, sync]);

  const syncNow = useCallback(async (): Promise<boolean> => {
    const saved = await sync();
    return saved && !hasPending();
  }, [sync, hasPending]);

  const hasUnsynced = useMemo(
    () => (email ? hasPending() : false),
    // `finished` and `status` aren't read, but changing is when the answer may have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [email, history, finished, status, hasPending],
  );

  return { status, hasUnsynced, syncNow };
}
