import { isDeepStrictEqual } from 'util';
import { albumNameKey, changedAt, Feedback, LibraryItem, pruneLibrary } from '@shared/types';
import { LibraryChanges, LibraryRecord } from '../repositories/libraryRepository';

/** How long a removal is remembered. A device away longer than this may bring the album back. */
export const REMOVAL_KEPT_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export function keyOfItem(item: LibraryItem): string {
  return albumNameKey(item.recommendation);
}

/** The verdict given more recently; a tie keeps the first. */
function newerFeedback(first?: Feedback, second?: Feedback): Feedback | undefined {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second.at) > Date.parse(first.at) ? second : first;
}

/**
 * Two copies of one held album. The details stay as they were, with anything the first lacks
 * filled in from the second (the cover is found after the pick, and may be found on one device
 * first). The verdict is whichever was given last.
 */
export function mergeItems(held: LibraryItem, incoming: LibraryItem): LibraryItem {
  const feedback = newerFeedback(held.feedback, incoming.feedback);
  const heldPick = held.recommendation;
  const incomingPick = incoming.recommendation;
  return {
    recommendation: {
      ...incomingPick,
      ...heldPick,
      genres: heldPick.genres ?? incomingPick.genres,
      country: heldPick.country ?? incomingPick.country,
      releaseGroupId: heldPick.releaseGroupId ?? incomingPick.releaseGroupId,
      hook: heldPick.hook ?? incomingPick.hook,
      slug: heldPick.slug ?? incomingPick.slug,
    },
    artwork: {
      artworkUrl: held.artwork.artworkUrl ?? incoming.artwork.artworkUrl,
      year: held.artwork.year ?? incoming.artwork.year,
      appleMusicUrl: held.artwork.appleMusicUrl ?? incoming.artwork.appleMusicUrl,
    },
    createdAt:
      Date.parse(incoming.createdAt) < Date.parse(held.createdAt)
        ? incoming.createdAt
        : held.createdAt,
    ...(feedback ? { feedback } : {}),
  };
}

function withoutUndefined(item: LibraryItem): LibraryItem {
  // JSON drops undefined, so a stored copy and a merged one only compare equal once it's gone.
  return JSON.parse(JSON.stringify(item)) as LibraryItem;
}

function album(item: LibraryItem, updatedAt: Date): LibraryRecord {
  return { kind: 'album', key: keyOfItem(item), item, updatedAt };
}

/**
 * What to write for the changes a device sent, given what the account holds now: only the rows
 * that really change, so repeating a request writes nothing. An album taken out is brought back
 * only by a change made after it was taken out; one changed after another device took it out is
 * kept.
 */
export function planWrites(
  current: ReadonlyMap<string, LibraryRecord>,
  { items, deletions, now }: Pick<LibraryChanges, 'items' | 'deletions' | 'now'>,
): LibraryRecord[] {
  const working = new Map(current);
  const written = new Map<string, LibraryRecord>();

  const write = (record: LibraryRecord): void => {
    working.set(record.key, record);
    written.set(record.key, record);
  };

  for (const { key, at } of deletions) {
    const held = working.get(key);
    if (held?.kind === 'removed') {
      if (at.getTime() > held.removedAt.getTime()) {
        write({ kind: 'removed', key, removedAt: at, updatedAt: now });
      }
      continue;
    }
    if (held && at.getTime() < changedAt(held.item)) continue;
    write({ kind: 'removed', key, removedAt: at, updatedAt: now });
  }

  for (const incoming of items) {
    const clean = withoutUndefined(incoming);
    const key = keyOfItem(clean);
    const held = working.get(key);
    if (!held) {
      write(album(clean, now));
    } else if (held.kind === 'removed') {
      if (changedAt(clean) > held.removedAt.getTime()) write(album(clean, now));
    } else {
      const merged = withoutUndefined(mergeItems(held.item, clean));
      // Compared as values: a stored copy may list its fields in a different order.
      if (!isDeepStrictEqual(merged, held.item)) write(album(merged, now));
    }
  }

  return [...written.values()];
}

/**
 * Keys to clear out: removals older than REMOVAL_KEPT_DAYS, and unrated picks the browser would
 * roll off too. Rated albums are never listed.
 */
export function expiredKeys(records: readonly LibraryRecord[], now: Date): string[] {
  const removalCutoff = now.getTime() - REMOVAL_KEPT_DAYS * DAY_MS;
  const expired: string[] = [];
  const held: { readonly record: LibraryRecord & { kind: 'album' }; readonly item: LibraryItem }[] =
    [];

  for (const record of records) {
    if (record.kind === 'removed') {
      if (record.removedAt.getTime() < removalCutoff) expired.push(record.key);
    } else {
      held.push({ record, item: record.item });
    }
  }

  const newestFirst = held
    .map(({ item }) => item)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const kept = new Set(pruneLibrary(newestFirst, now.getTime()));
  for (const { record, item } of held) {
    if (!kept.has(item)) expired.push(record.key);
  }
  return expired;
}

/** True when a sync makes the crate bigger and leaves it over the limit. */
export function overfills(before: number, after: number, maxRecords: number): boolean {
  return after > maxRecords && after > before;
}
