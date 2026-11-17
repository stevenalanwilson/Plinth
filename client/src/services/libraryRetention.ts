import { HistoryEntry } from '../types/history';

// Picks nobody rated are a log of what was suggested, so they roll off. Anything the listener
// rated is their crate and is kept for good: owning an album doesn't expire.
export const UNRATED_MAX_AGE_DAYS = 90;
export const UNRATED_MAX_ENTRIES = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the listener has given the album a status (a cleared rating doesn't count). */
export function isRated(entry: HistoryEntry): boolean {
  return entry.feedback?.status != null;
}

/**
 * Applies the retention rules to a library kept newest first: every rated album stays, and of the
 * rest only the newest few, within the age limit. The order is left as it is.
 */
export function pruneLibrary(
  entries: readonly HistoryEntry[],
  now: number = Date.now(),
): HistoryEntry[] {
  const cutoff = now - UNRATED_MAX_AGE_DAYS * DAY_MS;
  let unratedKept = 0;

  return entries.filter((entry) => {
    if (isRated(entry)) return true;
    // Written as "not newer than" so a date that doesn't parse drops the entry, as it always has.
    if (!(new Date(entry.createdAt).getTime() > cutoff)) return false;
    unratedKept += 1;
    return unratedKept <= UNRATED_MAX_ENTRIES;
  });
}
