import {
  LibraryChanges,
  LibraryFullError,
  LibraryRecord,
  LibraryRepository,
} from './libraryRepository';
import { expiredKeys, overfills, planWrites } from '../services/libraryMerge';

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryLibraryRepository(): LibraryRepository {
  const byAccount = new Map<string, Map<string, LibraryRecord>>();

  return {
    // Nothing here waits, so one call finishes before the next starts.
    async sync(accountId: string, changes: LibraryChanges): Promise<readonly LibraryRecord[]> {
      const held = byAccount.get(accountId) ?? new Map<string, LibraryRecord>();
      // Worked out on a copy, so a request that is refused leaves the crate as it was.
      const records = new Map(held);

      for (const record of planWrites(records, changes)) records.set(record.key, record);
      for (const key of expiredKeys([...records.values()], changes.now)) records.delete(key);
      if (overfills(held.size, records.size, changes.maxRecords)) {
        throw new LibraryFullError(changes.maxRecords);
      }
      byAccount.set(accountId, records);

      const { since } = changes;
      return [...records.values()].filter(
        (record) => since === null || record.updatedAt.getTime() > since.getTime(),
      );
    },

    async removeAll(accountId: string): Promise<void> {
      byAccount.delete(accountId);
    },
  };
}
