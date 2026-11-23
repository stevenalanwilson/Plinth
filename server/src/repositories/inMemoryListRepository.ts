import { ListExistsError, ListOwner, ListRepository, NewList, StoredList } from './listRepository';

export interface InMemoryListOptions {
  /** Whether an album is stored. Lists refuse albums that aren't, as the database does. */
  readonly hasAlbum?: (releaseGroupId: string) => boolean;
}

function sameOwner(a: ListOwner, b: ListOwner): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function sameKind(a: StoredList, b: StoredList): boolean {
  return a.kind === b.kind && a.qualifier === b.qualifier;
}

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryListRepository({
  hasAlbum = (): boolean => true,
}: InMemoryListOptions = {}): ListRepository {
  const byId = new Map<string, StoredList>();

  function checkAlbums(releaseGroupIds: readonly string[]): void {
    if (new Set(releaseGroupIds).size !== releaseGroupIds.length) {
      throw new Error('An album can be in a list only once');
    }
    const missing = releaseGroupIds.find((id) => !hasAlbum(id));
    if (missing !== undefined) throw new Error(`Album ${missing} is not stored`);
  }

  function ownedBy(owner: ListOwner): StoredList[] {
    return [...byId.values()].filter((list) => sameOwner(list.owner, owner));
  }

  return {
    // Nothing here waits, so one call finishes before the next starts.
    async create(list: NewList): Promise<StoredList> {
      checkAlbums(list.releaseGroupIds);
      const { now, ...rest } = list;
      const stored: StoredList = { ...rest, createdAt: now, updatedAt: now };
      if (byId.has(stored.id)) throw new Error(`List ${stored.id} already exists`);
      if (ownedBy(stored.owner).some((other) => sameKind(other, stored))) {
        throw new ListExistsError();
      }
      byId.set(stored.id, stored);
      return stored;
    },

    async findById(id: string): Promise<StoredList | null> {
      return byId.get(id) ?? null;
    },

    async findByOwner(owner: ListOwner): Promise<readonly StoredList[]> {
      return ownedBy(owner);
    },

    async replaceAlbums(
      id: string,
      owner: ListOwner,
      releaseGroupIds: readonly string[],
      now: Date,
    ): Promise<StoredList | null> {
      const list = byId.get(id);
      if (!list || !sameOwner(list.owner, owner)) return null;

      checkAlbums(releaseGroupIds);
      const changed: StoredList = { ...list, releaseGroupIds, updatedAt: now };
      byId.set(id, changed);
      return changed;
    },

    async delete(id: string, owner: ListOwner): Promise<boolean> {
      const list = byId.get(id);
      if (!list || !sameOwner(list.owner, owner)) return false;
      byId.delete(id);
      return true;
    },

    async moveToAccount(deviceId: string, accountId: string): Promise<void> {
      const account: ListOwner = { kind: 'account', id: accountId };
      for (const list of ownedBy({ kind: 'device', id: deviceId })) {
        const clash = ownedBy(account).find((other) => sameKind(other, list));
        // Ties go to the account's list, which is already where the person will look.
        if (clash && clash.updatedAt.getTime() >= list.updatedAt.getTime()) {
          byId.delete(list.id);
          continue;
        }
        if (clash) byId.delete(clash.id);
        byId.set(list.id, { ...list, owner: account });
      }
    },

    async removeAllForAccount(accountId: string): Promise<void> {
      for (const list of ownedBy({ kind: 'account', id: accountId })) byId.delete(list.id);
    },
  };
}
