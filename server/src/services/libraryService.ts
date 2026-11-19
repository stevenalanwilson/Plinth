import { LibrarySyncRequest, LibrarySyncResponse } from '@shared/types';
import { LibraryRecord, LibraryRepository } from '../repositories/libraryRepository';

/**
 * How far back the returned cursor reaches. Two saves can finish in a different order from the
 * one they started in, so a device that resumes from exactly "now" could miss one; resuming a
 * little earlier only sends a few albums twice, which does no harm.
 */
export const CURSOR_OVERLAP_MS = 10_000;

/**
 * Most albums and removals an answer carries. A new device is told the rest by asking again, so
 * however large the crate, no one response is.
 */
export const LIBRARY_PAGE_SIZE = 500;

/**
 * Most albums and removals one account may hold, which is more than anyone listens to and what
 * stops one account storing without end. Removals are counted because they are kept for a while.
 */
export const LIBRARY_MAX_RECORDS = 5_000;

export interface LibraryLimits {
  readonly pageSize: number;
  readonly maxRecords: number;
}

const DEFAULT_LIMITS: LibraryLimits = {
  pageSize: LIBRARY_PAGE_SIZE,
  maxRecords: LIBRARY_MAX_RECORDS,
};

interface Page {
  readonly records: readonly LibraryRecord[];
  /** Set when there is more: the time of the last record given, which the next ask starts after. */
  readonly resumeAfter: Date | null;
}

/**
 * The oldest changes first, about `size` of them. Whole moments are kept together: records saved
 * together share a time, and "after this time" couldn't tell which of them had been sent.
 */
export function firstPage(records: readonly LibraryRecord[], size: number): Page {
  const oldestFirst = [...records].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  if (oldestFirst.length <= size) return { records: oldestFirst, resumeAfter: null };

  const lastTime = oldestFirst[size - 1].updatedAt.getTime();
  let end = size;
  while (end < oldestFirst.length && oldestFirst[end].updatedAt.getTime() === lastTime) end += 1;
  if (end === oldestFirst.length) return { records: oldestFirst, resumeAfter: null };
  return { records: oldestFirst.slice(0, end), resumeAfter: new Date(lastTime) };
}

/**
 * Saves what a device changed and answers with what the account has changed since the device
 * last heard. The request is safe to repeat.
 */
export async function syncLibrary(
  library: LibraryRepository,
  accountId: string,
  request: LibrarySyncRequest,
  now: Date = new Date(),
  limits: LibraryLimits = DEFAULT_LIMITS,
): Promise<LibrarySyncResponse> {
  const records = await library.sync(accountId, {
    items: request.items,
    deletions: request.deletions.map(({ key, at }) => ({ key, at: new Date(at) })),
    since: request.since === null ? null : new Date(request.since),
    now,
    maxRecords: limits.maxRecords,
  });

  const page = firstPage(records, limits.pageSize);
  return {
    items: page.records.flatMap((record) => (record.kind === 'album' ? [record.item] : [])),
    deletions: page.records.flatMap((record) =>
      record.kind === 'removed' ? [{ key: record.key, at: record.removedAt.toISOString() }] : [],
    ),
    // Part way through, where this page ends; at the end, a little before now.
    cursor: (page.resumeAfter ?? new Date(now.getTime() - CURSOR_OVERLAP_MS)).toISOString(),
    ...(page.resumeAfter ? { more: true } : {}),
  };
}
