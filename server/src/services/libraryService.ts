import { LibrarySyncRequest, LibrarySyncResponse } from '@shared/types';
import { LibraryRepository } from '../repositories/libraryRepository';

/**
 * How far back the returned cursor reaches. Two saves can finish in a different order from the
 * one they started in, so a device that resumes from exactly "now" could miss one; resuming a
 * little earlier only sends a few albums twice, which does no harm.
 */
export const CURSOR_OVERLAP_MS = 10_000;

/**
 * Saves what a device changed and answers with what the account has changed since the device
 * last heard. The request is safe to repeat.
 */
export async function syncLibrary(
  library: LibraryRepository,
  accountId: string,
  request: LibrarySyncRequest,
  now: Date = new Date(),
): Promise<LibrarySyncResponse> {
  const records = await library.sync(accountId, {
    items: request.items,
    deletions: request.deletions.map(({ key, at }) => ({ key, at: new Date(at) })),
    since: request.since === null ? null : new Date(request.since),
    now,
  });

  return {
    items: records.flatMap((record) => (record.kind === 'album' ? [record.item] : [])),
    deletions: records.flatMap((record) =>
      record.kind === 'removed' ? [{ key: record.key, at: record.removedAt.toISOString() }] : [],
    ),
    cursor: new Date(now.getTime() - CURSOR_OVERLAP_MS).toISOString(),
  };
}
