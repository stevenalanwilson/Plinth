import { ListKind, ListQualifier, ListResponse, listTitle } from '@shared/types';
import { AlbumRepository } from '../repositories/albumRepository';
import { ListOwner, ListRepository, StoredList } from '../repositories/listRepository';
import { newListId } from '../utils/listIds';
import { AlbumByIdLookup } from './albumLookupService';
import { getAlbum, saveAlbum, toAlbumResponse } from './albumService';

/** How many albums a list of each kind holds. */
const LIST_SIZES: Readonly<Record<ListKind, number>> = { top: 3 };

export interface ListDependencies {
  readonly lists: ListRepository;
  readonly albums: AlbumRepository;
  /** Asks MusicBrainz what an album is, by its release group ID. */
  readonly lookUpAlbum: (releaseGroupId: string) => Promise<AlbumByIdLookup>;
  /** Makes the code for a new list; the default is random. */
  readonly newId?: () => string;
}

/** What reading a list needs: it never writes, or asks MusicBrainz anything. */
export type ListReadDependencies = Pick<ListDependencies, 'lists' | 'albums'>;

export interface ListInput {
  readonly kind: ListKind;
  readonly qualifier: ListQualifier;
  /** Albums in order, best first. */
  readonly releaseGroupIds: readonly string[];
}

/** MusicBrainz has no album with this ID, or it is not an album. */
export class UnknownAlbumError extends Error {
  constructor(readonly releaseGroupId: string) {
    super(`No album was found for ${releaseGroupId}`);
    this.name = 'UnknownAlbumError';
  }
}

/** MusicBrainz couldn't be asked, so it isn't known whether an album exists. */
export class AlbumLookupUnavailableError extends Error {
  constructor() {
    super('Albums could not be looked up right now');
    this.name = 'AlbumLookupUnavailableError';
  }
}

/** The albums can't make a list: there are too many, or one is in it twice. */
export class InvalidListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidListError';
  }
}

function checkAlbums(releaseGroupIds: readonly string[], size: number): void {
  if (releaseGroupIds.length > size) {
    throw new InvalidListError(`A list of this kind holds at most ${size} albums`);
  }
  if (new Set(releaseGroupIds).size !== releaseGroupIds.length) {
    throw new InvalidListError('An album can be in a list only once');
  }
}

/**
 * Makes sure every album has a page of its own. An album not stored yet is looked up in
 * MusicBrainz, so what is stored is what MusicBrainz says and not what a request claimed.
 */
async function storeAlbums(
  { albums, lookUpAlbum }: ListDependencies,
  releaseGroupIds: readonly string[],
): Promise<void> {
  for (const releaseGroupId of releaseGroupIds) {
    if (await albums.findByReleaseGroupId(releaseGroupId)) continue;

    const lookup = await lookUpAlbum(releaseGroupId);
    if (lookup.status === 'lookup_failed') throw new AlbumLookupUnavailableError();
    if (lookup.status === 'not_found') throw new UnknownAlbumError(releaseGroupId);
    await saveAlbum(albums, lookup.album);
  }
}

function isOwnedBy(list: StoredList, viewer: ListOwner | null): boolean {
  return viewer !== null && list.owner.kind === viewer.kind && list.owner.id === viewer.id;
}

/**
 * The list as it is sent out. With `withCovers`, each album's cover is looked up if that hasn't
 * been done (once, then kept), which can take seconds: that is for a list being shown to
 * someone. Without, covers are only as known already, so saving doesn't wait on them.
 */
async function toResponse(
  { albums }: ListReadDependencies,
  list: StoredList,
  viewer: ListOwner | null,
  now: Date,
  withCovers: boolean,
): Promise<ListResponse> {
  const found = await Promise.all(
    list.releaseGroupIds.map(async (releaseGroupId) => {
      const stored = await albums.findByReleaseGroupId(releaseGroupId);
      if (!stored) return null;
      return withCovers ? getAlbum(albums, stored.slug, now) : toAlbumResponse(stored);
    }),
  );
  return {
    id: list.id,
    kind: list.kind,
    qualifier: list.qualifier,
    size: list.size,
    title: listTitle(list.kind, list.qualifier, list.size),
    albums: found.filter((album) => album !== null),
    updatedAt: list.updatedAt.toISOString(),
    isOwner: isOwnedBy(list, viewer),
  };
}

/**
 * Makes the owner's list of this kind. Rejects if they already have one, if an album isn't
 * known, or if the albums can't make a list.
 */
export async function createList(
  deps: ListDependencies,
  owner: ListOwner,
  { kind, qualifier, releaseGroupIds }: ListInput,
  now: Date = new Date(),
): Promise<ListResponse> {
  const size = LIST_SIZES[kind];
  checkAlbums(releaseGroupIds, size);
  await storeAlbums(deps, releaseGroupIds);

  const list = await deps.lists.create({
    id: (deps.newId ?? newListId)(),
    owner,
    kind,
    qualifier,
    size,
    releaseGroupIds,
    now,
  });
  return toResponse(deps, list, owner, now, false);
}

/** Puts these albums, in this order, in the owner's list. Null if the owner has no such list. */
export async function replaceListAlbums(
  deps: ListDependencies,
  owner: ListOwner,
  id: string,
  releaseGroupIds: readonly string[],
  now: Date = new Date(),
): Promise<ListResponse | null> {
  const current = await deps.lists.findById(id);
  if (!current || !isOwnedBy(current, owner)) return null;

  checkAlbums(releaseGroupIds, current.size);
  await storeAlbums(deps, releaseGroupIds);

  const changed = await deps.lists.replaceAlbums(id, owner, releaseGroupIds, now);
  return changed ? toResponse(deps, changed, owner, now, false) : null;
}

/** Removes the owner's list, returning whether there was one. */
export function deleteList(deps: ListDependencies, owner: ListOwner, id: string): Promise<boolean> {
  return deps.lists.delete(id, owner);
}

/**
 * A list for anyone who has its code, once it is full: a list is only shared when it has all its
 * albums, so one that isn't finished is shown to its owner alone. `viewer` also decides whether
 * they may change it.
 */
export async function getList(
  deps: ListReadDependencies,
  viewer: ListOwner | null,
  id: string,
  now: Date = new Date(),
): Promise<ListResponse | null> {
  const list = await deps.lists.findById(id);
  if (!list) return null;

  const isFull = list.releaseGroupIds.length >= list.size;
  if (!isFull && !isOwnedBy(list, viewer)) return null;
  return toResponse(deps, list, viewer, now, true);
}

export async function getOwnLists(
  deps: ListReadDependencies,
  owner: ListOwner,
  now: Date = new Date(),
): Promise<ListResponse[]> {
  const lists = await deps.lists.findByOwner(owner);
  // For editing, which doesn't need covers; the list page, through getList, fills them in.
  return Promise.all(lists.map((list) => toResponse(deps, list, owner, now, false)));
}
