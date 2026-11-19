import { LibraryItem } from '@shared/types';

/** One album in an account's saved crate: either held, or taken out and remembered as such. */
export type LibraryRecord =
  | {
      readonly kind: 'album';
      /** albumNameKey of the album. */
      readonly key: string;
      readonly item: LibraryItem;
      /** When the server last changed this row: what a device's "since" is compared with. */
      readonly updatedAt: Date;
    }
  | {
      readonly kind: 'removed';
      readonly key: string;
      readonly removedAt: Date;
      readonly updatedAt: Date;
    };

export interface LibraryChanges {
  readonly items: readonly LibraryItem[];
  readonly deletions: readonly { readonly key: string; readonly at: Date }[];
  /** Only what the server changed after this is returned; null asks for everything. */
  readonly since: Date | null;
  readonly now: Date;
  /** Most records (albums and removals) an account may hold; see LibraryFullError. */
  readonly maxRecords: number;
}

/**
 * The changes would make the account's crate bigger than it may be. Nothing was saved. A request
 * that doesn't make it bigger is always accepted, so it can always be brought back down.
 */
export class LibraryFullError extends Error {
  constructor(readonly maxRecords: number) {
    super(`An account can hold at most ${maxRecords} saved albums`);
    this.name = 'LibraryFullError';
  }
}

/** Every account's saved crate. Times are passed in, not read. */
export interface LibraryRepository {
  /**
   * Folds a device's changes into the account's crate (the newer change to an album wins, see
   * libraryMerge.ts), clears out what has expired, and returns what has changed since `since`.
   * Two calls for one account at once run one after the other. Repeating a call changes nothing.
   */
  sync(accountId: string, changes: LibraryChanges): Promise<readonly LibraryRecord[]>;
  /** Removes everything saved for the account, for when the account is deleted. */
  removeAll(accountId: string): Promise<void>;
}
