import { LibraryChanges, LibraryRecord, LibraryRepository } from './libraryRepository';
import { expiredKeys, planWrites } from '../services/libraryMerge';

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryLibraryRepository(): LibraryRepository {
  const byAccount = new Map<string, Map<string, LibraryRecord>>();

  return {
    // Nothing here waits, so one call finishes before the next starts.
    async sync(accountId: string, changes: LibraryChanges): Promise<readonly LibraryRecord[]> {
      const records = byAccount.get(accountId) ?? new Map<string, LibraryRecord>();
      byAccount.set(accountId, records);

      for (const record of planWrites(records, changes)) records.set(record.key, record);
      for (const key of expiredKeys([...records.values()], changes.now)) records.delete(key);

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
