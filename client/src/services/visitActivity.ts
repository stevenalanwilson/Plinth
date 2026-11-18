const PICKS_KEY = 'plinth-visit-picks';
const RATED_KEY = 'plinth-visit-rated';

// Counts for one browser tab session, kept in sessionStorage so they end when the tab does. They
// are only sent as numbers, so the server can tell whether the crate is being used without any way
// to tell who is using it.

/** Where a visit has got to; a field is missing when the tab can't keep count. */
export interface VisitActivity {
  /** Which pick this is, 1 for the first. */
  readonly pickNumber?: number;
  /** How many different albums have been answered so far. */
  readonly ratedThisVisit?: number;
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be blocked outright (some privacy settings); counting is then skipped.
    return null;
  }
}

function readRated(storage: Storage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RATED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function readPicks(storage: Storage): number {
  const count = Number.parseInt(storage.getItem(PICKS_KEY) ?? '0', 10);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/**
 * Counts one more pick in this visit and returns where the visit has got to, to send with it.
 * Returns nothing to send when storage is unavailable, so a visit that can't be counted is not
 * mistaken for one that answered nothing.
 */
export function startPick(storage: Storage | null = sessionStore()): VisitActivity {
  if (!storage) return {};
  try {
    const pickNumber = readPicks(storage) + 1;
    storage.setItem(PICKS_KEY, String(pickNumber));
    return { pickNumber, ratedThisVisit: readRated(storage).length };
  } catch {
    return {};
  }
}

/**
 * Notes that an album was answered in this visit. Each album counts once, however many times its
 * answer changes, and taking an answer back doesn't undo it: the tap was the engagement.
 */
export function recordRating(albumId: string, storage: Storage | null = sessionStore()): void {
  if (!storage) return;
  try {
    const rated = readRated(storage);
    if (rated.includes(albumId)) return;
    storage.setItem(RATED_KEY, JSON.stringify([...rated, albumId]));
  } catch {
    // A full or blocked store only means this answer isn't counted.
  }
}
