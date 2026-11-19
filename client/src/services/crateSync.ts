import {
  albumNameKey,
  LIBRARY_SYNC_MAX_DELETIONS,
  LIBRARY_SYNC_MAX_ITEMS,
  LibraryDeletion,
  LibraryItem,
  LibrarySyncRequest,
  LibrarySyncResponse,
} from '@shared/types';
import { HistoryEntry } from '../types/history';
import { fingerprint, entryKey, toLibraryItem, trimSynced, unsyncedEntries } from './librarySync';
import { loadSyncState, LibrarySyncState, newSyncState, saveSyncState } from './librarySyncState';

/** What syncing needs from the rest of the app, so it can be tried without a browser or a server. */
export interface CratePorts {
  /** The crate as it is now. */
  readonly getHistory: () => readonly HistoryEntry[];
  /** Folds what the account holds into the crate. */
  readonly applyRemote: (
    items: readonly LibraryItem[],
    deletions: readonly LibraryDeletion[],
  ) => void;
  readonly send: (
    request: LibrarySyncRequest,
    signal?: AbortSignal,
  ) => Promise<LibrarySyncResponse>;
}

// A safety stop, not a limit anyone should reach: 100 albums a round makes this 5,000 albums.
const MAX_ROUNDS = 50;

/**
 * Brings the crate and the account together: sends what the account doesn't hold yet (a hundred
 * albums at a time), takes what has changed there, and notes where each stands. If a round fails,
 * everything up to it is kept, and the next sync carries on from there.
 */
export async function syncCrate(
  email: string,
  ports: CratePorts,
  signal?: AbortSignal,
): Promise<void> {
  const stored = loadSyncState();
  let state: LibrarySyncState = stored?.email === email ? stored : newSyncState(email);
  state = { ...state, synced: trimSynced(ports.getHistory(), state.synced) };
  saveSyncState(state);

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const unsynced = unsyncedEntries(ports.getHistory(), state);
    const sending = unsynced.slice(0, LIBRARY_SYNC_MAX_ITEMS);
    const removing = state.removals.slice(0, LIBRARY_SYNC_MAX_DELETIONS);

    const response = await ports.send(
      {
        since: state.cursor,
        items: sending.map(toLibraryItem),
        deletions: removing,
      },
      signal,
    );
    ports.applyRemote(response.items, response.deletions);

    // Read again: an album may have been removed while the request was out, and that was noted in
    // storage, not in this copy.
    const current = loadSyncState() ?? state;
    const synced: Record<string, string> = { ...current.synced };
    for (const entry of sending) synced[entryKey(entry)] = fingerprint(entry);
    for (const item of response.items) {
      synced[albumNameKey(item.recommendation)] = item.feedback?.at ?? '';
    }
    // An album the account says is gone isn't held there any more. If it was kept here because it
    // had changed since, leaving it out of this list is what makes it be sent again.
    for (const { key } of response.deletions) delete synced[key];

    state = {
      ...current,
      cursor: response.cursor,
      synced,
      removals: current.removals.slice(removing.length),
    };
    saveSyncState(state);

    const moreToSend = unsynced.length > sending.length || state.removals.length > 0;
    if (!moreToSend) return;
  }
}
