import { LibraryDeletion } from '@shared/types';
import { HistoryEntry } from '../types/history';
import { entryKey } from './librarySync';

const STORAGE_KEY = 'plinth-library-sync';

/** What this browser knows about how its crate stands with the account it is signed in to. */
export interface LibrarySyncState {
  /** The account the crate is being kept with. A different one means a different crate. */
  readonly email: string;
  /** Where to resume asking the server for changes; null before the first sync. */
  readonly cursor: string | null;
  /** Each album the server is known to hold, with the fingerprint of the copy it holds. */
  readonly synced: Readonly<Record<string, string>>;
  /** Albums taken out of the crate that the server hasn't been told about yet. */
  readonly removals: readonly LibraryDeletion[];
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isState(value: unknown): value is LibrarySyncState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.email === 'string' &&
    (candidate.cursor === null || typeof candidate.cursor === 'string') &&
    typeof candidate.synced === 'object' &&
    candidate.synced !== null &&
    Array.isArray(candidate.removals)
  );
}

export function loadSyncState(): LibrarySyncState | null {
  try {
    const raw = localStore()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSyncState(state: LibrarySyncState): void {
  try {
    localStore()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to keep the sync state:', error);
  }
}

export function clearSyncState(): void {
  try {
    localStore()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing more can be done about storage that refuses to be written.
  }
}

/** The state for a crate that has never been synced with this account. */
export function newSyncState(email: string): LibrarySyncState {
  return { email, cursor: null, synced: {}, removals: [] };
}

/**
 * Notes albums taken out of the crate, to be told to the server at the next sync. Only when this
 * browser is keeping its crate with an account, so a browser that never signs in remembers nothing
 * about what was removed. Called when the listener removes albums, never when the whole crate is
 * dropped from this device on signing out.
 */
export function recordRemovals(entries: readonly HistoryEntry[], now: Date = new Date()): void {
  const state = loadSyncState();
  if (!state || entries.length === 0) return;
  const at = now.toISOString();
  const fresh = entries.map((entry): LibraryDeletion => ({ key: entryKey(entry), at }));
  saveSyncState({ ...state, removals: [...state.removals, ...fresh] });
}
