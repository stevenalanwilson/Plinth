import { describe, it, expect, beforeEach } from 'vitest';
import { ListOwner, ListExistsError, ListRepository, NewList, StoredList } from './listRepository';

const T0 = new Date('2026-11-24T12:00:00.000Z');
const LATER = new Date('2026-11-24T13:00:00.000Z');
const LATEST = new Date('2026-11-24T14:00:00.000Z');

export interface ListRepositoryFixture {
  readonly lists: ListRepository;
  /** Postgres only accepts owners and albums that exist, so each is made through here. */
  readonly newDeviceId: () => Promise<string>;
  readonly newAccountId: () => Promise<string>;
  readonly newAlbumId: () => Promise<string>;
}

/** Behaviour every ListRepository must share, so the in-memory one is a faithful stand-in. */
export function describeListRepository(
  name: string,
  createFixture: () => Promise<ListRepositoryFixture>,
): void {
  describe(`${name} (ListRepository contract)`, () => {
    let lists: ListRepository;
    let fixture: ListRepositoryFixture;
    let codes = 0;

    beforeEach(async () => {
      fixture = await createFixture();
      lists = fixture.lists;
    });

    async function deviceOwner(): Promise<ListOwner> {
      return { kind: 'device', id: await fixture.newDeviceId() };
    }

    async function accountOwner(): Promise<ListOwner> {
      return { kind: 'account', id: await fixture.newAccountId() };
    }

    async function albums(count: number): Promise<string[]> {
      return Promise.all(Array.from({ length: count }, () => fixture.newAlbumId()));
    }

    async function make(
      owner: ListOwner,
      releaseGroupIds: readonly string[],
      now: Date = T0,
    ): Promise<StoredList> {
      codes += 1;
      const list: NewList = {
        id: `code${String(codes).padStart(6, '0')}`,
        owner,
        kind: 'top',
        qualifier: 'all-time',
        size: 3,
        releaseGroupIds,
        now,
      };
      return lists.create(list);
    }

    describe('create and find', () => {
      it('keeps the albums in order, with who owns the list and when it was made', async () => {
        const owner = await deviceOwner();
        const [a, b, c] = await albums(3);

        const created = await make(owner, [b, c, a]);
        const found = await lists.findById(created.id);

        expect(found).toEqual({
          id: created.id,
          owner,
          kind: 'top',
          qualifier: 'all-time',
          size: 3,
          releaseGroupIds: [b, c, a],
          createdAt: T0,
          updatedAt: T0,
        });
      });

      it('holds a list that is only part filled, or empty', async () => {
        const [a] = await albums(1);

        const partial = await make(await deviceOwner(), [a]);
        const empty = await make(await deviceOwner(), []);

        expect((await lists.findById(partial.id))?.releaseGroupIds).toEqual([a]);
        expect((await lists.findById(empty.id))?.releaseGroupIds).toEqual([]);
      });

      it('finds nothing for a code that was never made', async () => {
        expect(await lists.findById('nosuchcode')).toBeNull();
      });

      it('turns away a second list of the same kind for one owner', async () => {
        const owner = await deviceOwner();
        await make(owner, []);

        await expect(make(owner, [])).rejects.toBeInstanceOf(ListExistsError);
      });

      it('lets an account and a device each have their own', async () => {
        await make(await deviceOwner(), []);
        await make(await accountOwner(), []);
      });

      it('lets different owners each have a list', async () => {
        await make(await deviceOwner(), []);
        await make(await deviceOwner(), []);
      });

      it('turns away the same album twice in one list', async () => {
        const [a] = await albums(1);

        await expect(make(await deviceOwner(), [a, a])).rejects.toThrow();
      });

      it('turns away an album that is not stored', async () => {
        await expect(
          make(await deviceOwner(), ['00000000-0000-4000-8000-000000000000']),
        ).rejects.toThrow();
      });

      it('leaves nothing behind when a list is turned away', async () => {
        const owner = await deviceOwner();
        const [a] = await albums(1);
        await expect(make(owner, [a, a])).rejects.toThrow();

        expect(await lists.findByOwner(owner)).toEqual([]);
      });
    });

    describe('findByOwner', () => {
      it('returns the owner’s lists and no one else’s', async () => {
        const owner = await deviceOwner();
        const mine = await make(owner, []);
        await make(await deviceOwner(), []);

        expect((await lists.findByOwner(owner)).map((list) => list.id)).toEqual([mine.id]);
      });

      it('returns nothing for an owner with no lists', async () => {
        expect(await lists.findByOwner(await deviceOwner())).toEqual([]);
      });
    });

    describe('replaceAlbums', () => {
      it('puts the albums in, in order, and records when it changed', async () => {
        const owner = await deviceOwner();
        const [a, b, c] = await albums(3);
        const created = await make(owner, [a, b]);

        const changed = await lists.replaceAlbums(created.id, owner, [c, a, b], LATER);

        expect(changed?.releaseGroupIds).toEqual([c, a, b]);
        expect(changed?.createdAt).toEqual(T0);
        expect(changed?.updatedAt).toEqual(LATER);
        expect(await lists.findById(created.id)).toEqual(changed);
      });

      it('can empty a list', async () => {
        const owner = await deviceOwner();
        const [a] = await albums(1);
        const created = await make(owner, [a]);

        const changed = await lists.replaceAlbums(created.id, owner, [], LATER);

        expect(changed?.releaseGroupIds).toEqual([]);
      });

      it('does not change anyone else’s list', async () => {
        const owner = await deviceOwner();
        const [a, b] = await albums(2);
        const created = await make(owner, [a]);

        const changed = await lists.replaceAlbums(created.id, await deviceOwner(), [b], LATER);

        expect(changed).toBeNull();
        expect((await lists.findById(created.id))?.releaseGroupIds).toEqual([a]);
      });

      it('does not treat a device and an account with the same id as one owner', async () => {
        const owner = await deviceOwner();
        const created = await make(owner, []);

        const changed = await lists.replaceAlbums(
          created.id,
          { kind: 'account', id: owner.id },
          [],
          LATER,
        );

        expect(changed).toBeNull();
      });

      it('finds nothing to change for a code that was never made', async () => {
        expect(await lists.replaceAlbums('nosuchcode', await deviceOwner(), [], LATER)).toBeNull();
      });

      it('leaves the list as it was when the new albums are refused', async () => {
        const owner = await deviceOwner();
        const [a, b] = await albums(2);
        const created = await make(owner, [a, b]);

        await expect(lists.replaceAlbums(created.id, owner, [a, a], LATER)).rejects.toThrow();

        const found = await lists.findById(created.id);
        expect(found?.releaseGroupIds).toEqual([a, b]);
        expect(found?.updatedAt).toEqual(T0);
      });
    });

    describe('delete', () => {
      it('removes the owner’s list', async () => {
        const owner = await deviceOwner();
        const created = await make(owner, []);

        expect(await lists.delete(created.id, owner)).toBe(true);
        expect(await lists.findById(created.id)).toBeNull();
      });

      it('lets the owner make a new one afterwards', async () => {
        const owner = await deviceOwner();
        const created = await make(owner, []);
        await lists.delete(created.id, owner);

        await make(owner, []);
      });

      it('does not remove anyone else’s list', async () => {
        const created = await make(await deviceOwner(), []);

        expect(await lists.delete(created.id, await deviceOwner())).toBe(false);
        expect(await lists.findById(created.id)).not.toBeNull();
      });

      it('says there was nothing to remove for a code that was never made', async () => {
        expect(await lists.delete('nosuchcode', await deviceOwner())).toBe(false);
      });
    });

    describe('moveToAccount', () => {
      it('hands the device’s list to the account, keeping its code and albums', async () => {
        const device = await deviceOwner();
        const account = await accountOwner();
        const [a, b] = await albums(2);
        const created = await make(device, [a, b]);

        await lists.moveToAccount(device.id, account.id);

        const moved = await lists.findById(created.id);
        expect(moved?.owner).toEqual(account);
        expect(moved?.releaseGroupIds).toEqual([a, b]);
        expect(await lists.findByOwner(device)).toEqual([]);
      });

      it('lets the account change it afterwards', async () => {
        const device = await deviceOwner();
        const account = await accountOwner();
        const [a] = await albums(1);
        const created = await make(device, []);
        await lists.moveToAccount(device.id, account.id);

        const changed = await lists.replaceAlbums(created.id, account, [a], LATER);

        expect(changed?.releaseGroupIds).toEqual([a]);
      });

      it('keeps the device’s list, and removes the account’s, when the device’s was changed last', async () => {
        const device = await deviceOwner();
        const account = await accountOwner();
        const [a, b] = await albums(2);
        const deviceList = await make(device, [a], LATER);
        const accountList = await make(account, [b], T0);

        await lists.moveToAccount(device.id, account.id);

        expect(await lists.findById(accountList.id)).toBeNull();
        const kept = await lists.findById(deviceList.id);
        expect(kept?.owner).toEqual(account);
        expect(kept?.releaseGroupIds).toEqual([a]);
        expect(await lists.findByOwner(account)).toHaveLength(1);
      });

      it('keeps the account’s list, and removes the device’s, when the account’s was changed last', async () => {
        const device = await deviceOwner();
        const account = await accountOwner();
        const [a, b] = await albums(2);
        const deviceList = await make(device, [a], T0);
        const accountList = await make(account, [b], LATER);

        await lists.moveToAccount(device.id, account.id);

        expect(await lists.findById(deviceList.id)).toBeNull();
        expect((await lists.findById(accountList.id))?.releaseGroupIds).toEqual([b]);
        expect(await lists.findByOwner(account)).toHaveLength(1);
      });

      it('keeps the account’s list when both were changed at the same moment', async () => {
        const device = await deviceOwner();
        const account = await accountOwner();
        const deviceList = await make(device, [], LATER);
        const accountList = await make(account, [], LATER);

        await lists.moveToAccount(device.id, account.id);

        expect(await lists.findById(deviceList.id)).toBeNull();
        expect(await lists.findById(accountList.id)).not.toBeNull();
      });

      it('leaves other devices’ lists alone', async () => {
        const device = await deviceOwner();
        const other = await deviceOwner();
        const otherList = await make(other, [], LATEST);

        await lists.moveToAccount(device.id, await fixture.newAccountId());

        expect((await lists.findById(otherList.id))?.owner).toEqual(other);
      });

      it('does nothing for a device with no lists', async () => {
        const account = await accountOwner();
        const accountList = await make(account, []);

        await lists.moveToAccount(await fixture.newDeviceId(), account.id);

        expect(await lists.findById(accountList.id)).not.toBeNull();
      });
    });

    describe('removeAllForAccount', () => {
      it('removes the account’s lists and no one else’s', async () => {
        const account = await accountOwner();
        const mine = await make(account, []);
        const theirs = await make(await accountOwner(), []);
        const device = await make(await deviceOwner(), []);

        await lists.removeAllForAccount(account.id);

        expect(await lists.findById(mine.id)).toBeNull();
        expect(await lists.findById(theirs.id)).not.toBeNull();
        expect(await lists.findById(device.id)).not.toBeNull();
      });
    });
  });
}
