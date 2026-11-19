import { albumNameKey, changedAt, LibraryDeletion, LibraryItem } from '@shared/types';
import { HistoryEntry } from '../types/history';
import { isSameAlbum } from './albumIdentity';
import { mergeHistory } from './libraryExport';
import type { LibrarySyncState } from './librarySyncState';

/** What the server knows an album by. */
export function entryKey(entry: HistoryEntry): string {
  return albumNameKey(entry.recommendation);
}

/**
 * What marks one version of an album from another: when its verdict last changed. A changed
 * verdict always has a new time, so this is enough to tell a copy the server holds from one it
 * doesn't. Nothing else about an album changes after it is picked, apart from its cover, which
 * every device can find for itself.
 */
export function fingerprint(entry: HistoryEntry): string {
  return entry.feedback?.at ?? '';
}

export function toLibraryItem(entry: HistoryEntry): LibraryItem {
  return {
    recommendation: entry.recommendation,
    artwork: entry.artworkResponse,
    createdAt: entry.createdAt,
    ...(entry.feedback ? { feedback: entry.feedback } : {}),
  };
}

export function fromLibraryItem(item: LibraryItem): HistoryEntry {
  return {
    // Ids belong to one device, so an album from the server gets a new one.
    id: crypto.randomUUID(),
    recommendation: item.recommendation,
    artworkResponse: item.artwork,
    createdAt: item.createdAt,
    ...(item.feedback ? { feedback: item.feedback } : {}),
  };
}

/** The albums the server doesn't hold in their current form, which is what has to be sent. */
export function unsyncedEntries(
  history: readonly HistoryEntry[],
  state: Pick<LibrarySyncState, 'synced'>,
): HistoryEntry[] {
  return history.filter((entry) => state.synced[entryKey(entry)] !== fingerprint(entry));
}

/** True when there is something the account doesn't have yet. */
export function hasUnsyncedChanges(
  history: readonly HistoryEntry[],
  state: Pick<LibrarySyncState, 'synced' | 'removals'>,
): boolean {
  return state.removals.length > 0 || unsyncedEntries(history, state).length > 0;
}

/** Forgets the albums the crate no longer has, so what is remembered doesn't grow for ever. */
export function trimSynced(
  history: readonly HistoryEntry[],
  synced: LibrarySyncState['synced'],
): LibrarySyncState['synced'] {
  const present = new Set(history.map(entryKey));
  return Object.fromEntries(Object.entries(synced).filter(([key]) => present.has(key)));
}

function sameEntries(first: readonly HistoryEntry[], second: readonly HistoryEntry[]): boolean {
  return first.length === second.length && first.every((entry, index) => entry === second[index]);
}

/**
 * Folds what the account holds into the crate. An album the account says was removed goes, unless
 * it was changed here after that (the same rule the server applies). The album on show stays
 * where it is. Returns the very same array when nothing changed, so applying a sync that brought
 * nothing new doesn't look like a change to the crate.
 */
export function applyServerChanges(
  history: readonly HistoryEntry[],
  items: readonly LibraryItem[],
  deletions: readonly LibraryDeletion[],
): readonly HistoryEntry[] {
  const removedAt = new Map(deletions.map(({ key, at }) => [key, Date.parse(at)]));
  const kept = history.filter((entry) => {
    const removed = removedAt.get(entryKey(entry));
    return removed === undefined || changedAt(entry) > removed;
  });

  const merged = mergeHistory(kept, items.map(fromLibraryItem));
  const onShow = kept[0];
  const shown = onShow
    ? merged.findIndex((entry) => isSameAlbum(entry.recommendation, onShow.recommendation))
    : -1;
  const next =
    shown > 0 ? [merged[shown], ...merged.filter((_, index) => index !== shown)] : merged;

  return sameEntries(history, next) ? history : next;
}
