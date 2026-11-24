import { VisitEntry } from '@shared/types';

const STORAGE_KEY = 'plinth-visit-entry';
const ALBUM_PAGE = /^\/album\/[^/]+\/?$/;
const LIST_PAGE = /^\/list\/[^/]+\/?$/;

// "shared-link" or "shared-list" until the visitor's first pick has carried it, then "counted",
// so each visit that began on a shared link is counted at most once. Kept for the tab's session
// only.
type StoredEntry = VisitEntry | 'counted' | 'direct';

function entryFor(pathname: string): StoredEntry {
  if (ALBUM_PAGE.test(pathname)) return 'shared-link';
  if (LIST_PAGE.test(pathname)) return 'shared-list';
  return 'direct';
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be blocked outright (some privacy settings); counting is then skipped.
    return null;
  }
}

function read(storage: Storage): StoredEntry | null {
  try {
    return storage.getItem(STORAGE_KEY) as StoredEntry | null;
  } catch {
    return null;
  }
}

function write(storage: Storage, entry: StoredEntry): void {
  try {
    storage.setItem(STORAGE_KEY, entry);
  } catch {
    // A full or blocked store only means this visit isn't counted.
  }
}

/**
 * Notes where this visit began, once per tab session: on an album page or a list page means
 * someone followed a shared link, and which kind of link is kept apart. Pages opened later in the
 * visit don't change it.
 */
export function recordVisitEntry(pathname: string, storage: Storage | null = sessionStore()): void {
  if (!storage || read(storage) !== null) return;
  write(storage, entryFor(pathname));
}

/**
 * The entry to send with a pick: "shared-link" or "shared-list" for the first pick of a visit
 * that began on one, and nothing after that.
 */
export function takeSharedLinkEntry(
  storage: Storage | null = sessionStore(),
): VisitEntry | undefined {
  if (!storage) return undefined;
  const entry = read(storage);
  if (entry !== 'shared-link' && entry !== 'shared-list') return undefined;
  write(storage, 'counted');
  return entry;
}
