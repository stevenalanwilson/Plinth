import { ListKind, ListQualifier } from '@shared/types';

/** Who a list belongs to: a device while its person is anonymous, their account once they sign in. */
export interface ListOwner {
  readonly kind: 'device' | 'account';
  readonly id: string;
}

export interface NewList {
  readonly id: string;
  readonly owner: ListOwner;
  readonly kind: ListKind;
  readonly qualifier: ListQualifier;
  readonly size: number;
  /** Albums (MusicBrainz release group IDs) in order, best first. */
  readonly releaseGroupIds: readonly string[];
  readonly now: Date;
}

export interface StoredList extends Omit<NewList, 'now'> {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The owner already has a list of this kind and qualifier. */
export class ListExistsError extends Error {
  constructor() {
    super('This owner already has a list of that kind');
    this.name = 'ListExistsError';
  }
}

/**
 * Lists of albums. Every album in a list must already be stored, and can be in it only once.
 * Times are passed in, not read from the clock.
 */
export interface ListRepository {
  /** Saves the list. Rejects with ListExistsError if the owner has one of this kind already. */
  create(list: NewList): Promise<StoredList>;
  /** Any list, whoever owns it: lists are public to those who have the link. */
  findById(id: string): Promise<StoredList | null>;
  findByOwner(owner: ListOwner): Promise<readonly StoredList[]>;
  /** Puts these albums, in this order, in the owner's list. Null if the owner has no such list. */
  replaceAlbums(
    id: string,
    owner: ListOwner,
    releaseGroupIds: readonly string[],
    now: Date,
  ): Promise<StoredList | null>;
  /** Removes the owner's list, returning whether there was one. */
  delete(id: string, owner: ListOwner): Promise<boolean>;
  /**
   * Hands the device's lists to the account when its person signs in. Where the account already
   * has a list of the same kind, the one changed most recently is kept and the other removed.
   */
  moveToAccount(deviceId: string, accountId: string): Promise<void>;
  /** Removes every list the account owns, for when the account is deleted. */
  removeAllForAccount(accountId: string): Promise<void>;
}
