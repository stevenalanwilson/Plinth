import { VisitEntry } from '@shared/types';

const STORAGE_KEY = 'plinth-visit-entry';
const ALBUM_PAGE = /^\/album\/[^/]+\/?$/;

// "shared-link" until the visitor's first pick has carried it, then "counted", so each visit
// that began on a shared link is counted at most once. Kept for the tab's session only.
type StoredEntry = 'shared-link' | 'counted' | 'direct';

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
 * Notes where this visit began, once per tab session: on an album page means someone followed
 * a shared link. Pages opened later in the visit don't change it.
 */
export function recordVisitEntry(pathname: string, storage: Storage | null = sessionStore()): void {
  if (!storage || read(storage) !== null) return;
  write(storage, ALBUM_PAGE.test(pathname) ? 'shared-link' : 'direct');
}

/** The entry to send with a pick: "shared-link" for the first pick of such a visit only. */
export function takeSharedLinkEntry(
  storage: Storage | null = sessionStore(),
): VisitEntry | undefined {
  if (!storage || read(storage) !== 'shared-link') return undefined;
  write(storage, 'counted');
  return 'shared-link';
}
