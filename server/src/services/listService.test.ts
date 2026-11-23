import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('./artworkService', () => ({
  fetchArtwork: vi
    .fn()
    .mockResolvedValue({ artworkUrl: 'https://img/cover.jpg', appleMusicUrl: null }),
}));

import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { createInMemoryListRepository } from '../repositories/inMemoryListRepository';
import { AlbumRepository } from '../repositories/albumRepository';
import { ListOwner, ListRepository } from '../repositories/listRepository';
import { AlbumByIdLookup } from './albumLookupService';
import {
  AlbumLookupUnavailableError,
  createList,
  deleteList,
  getList,
  getOwnLists,
  InvalidListError,
  listTitle,
  ListDependencies,
  ListInput,
  replaceListAlbums,
  UnknownAlbumError,
} from './listService';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const ME: ListOwner = { kind: 'device', id: 'device-me' };
const SOMEONE_ELSE: ListOwner = { kind: 'device', id: 'device-else' };

const CATALOGUE: Record<string, { artist: string; album: string; year: string }> = {
  'rg-blue': { artist: 'Miles Davis', album: 'Kind of Blue', year: '1959' },
  'rg-nevermind': { artist: 'Nirvana', album: 'Nevermind', year: '1991' },
  'rg-thriller': { artist: 'Michael Jackson', album: 'Thriller', year: '1982' },
  'rg-abbey': { artist: 'The Beatles', album: 'Abbey Road', year: '1969' },
};

let albums: AlbumRepository;
let lists: ListRepository;
let lookUpAlbum: ReturnType<typeof vi.fn<[string], Promise<AlbumByIdLookup>>>;
let deps: ListDependencies;
let codes: number;

beforeEach(() => {
  albums = createInMemoryAlbumRepository();
  lists = createInMemoryListRepository();
  codes = 0;
  lookUpAlbum = vi.fn(async (id: string): Promise<AlbumByIdLookup> => {
    const known = CATALOGUE[id];
    if (!known) return { status: 'not_found' };
    return {
      status: 'found',
      album: { releaseGroupId: id, ...known, hook: null, genres: [], country: null },
    };
  });
  deps = { lists, albums, lookUpAlbum, newId: (): string => `code${(codes += 1)}` };
});

const FULL = ['rg-blue', 'rg-nevermind', 'rg-thriller'];

const input = (releaseGroupIds: string[]): ListInput => ({
  kind: 'top',
  qualifier: 'all-time',
  releaseGroupIds,
});

describe('listTitle', () => {
  it('names a top 3 of all time', () => {
    expect(listTitle('top', 'all-time', 3)).toBe('My top 3 albums of all time');
  });
});

describe('createList', () => {
  it('makes the list, with the albums in order', async () => {
    const list = await createList(deps, ME, input(['rg-nevermind', 'rg-blue']), NOW);

    expect(list).toMatchObject({
      id: 'code1',
      kind: 'top',
      qualifier: 'all-time',
      size: 3,
      title: 'My top 3 albums of all time',
      updatedAt: NOW.toISOString(),
      isOwner: true,
    });
    expect(list.albums.map((album) => album.album)).toEqual(['Nevermind', 'Kind of Blue']);
    expect(list.albums[0]).toMatchObject({
      slug: 'nirvana-nevermind',
      artist: 'Nirvana',
      year: '1991',
    });
  });

  it('does not wait on covers, which would only slow saving', async () => {
    const { fetchArtwork } = await import('./artworkService');
    vi.mocked(fetchArtwork).mockClear();

    const list = await createList(deps, ME, input(['rg-blue']), NOW);
    await replaceListAlbums(deps, ME, list.id, ['rg-blue', 'rg-nevermind'], NOW);
    await getOwnLists(deps, ME, NOW);

    expect(fetchArtwork).not.toHaveBeenCalled();
  });

  it('stores each album as a real Plinth album, so it has a page of its own', async () => {
    await createList(deps, ME, input(['rg-blue']), NOW);

    expect((await albums.findBySlug('miles-davis-kind-of-blue'))?.releaseGroupId).toBe('rg-blue');
  });

  it('takes what MusicBrainz says about an album, and asks it once for one already stored', async () => {
    await createList(deps, ME, input(['rg-blue']), NOW);
    await createList(deps, SOMEONE_ELSE, input(['rg-blue']), NOW);

    expect(lookUpAlbum).toHaveBeenCalledTimes(1);
  });

  it('can be started empty, or part filled', async () => {
    expect((await createList(deps, ME, input([]), NOW)).albums).toEqual([]);
    expect((await createList(deps, SOMEONE_ELSE, input(['rg-blue']), NOW)).albums).toHaveLength(1);
  });

  it('refuses an album MusicBrainz does not know, and saves nothing', async () => {
    await expect(createList(deps, ME, input(['rg-blue', 'rg-made-up']), NOW)).rejects.toEqual(
      new UnknownAlbumError('rg-made-up'),
    );

    expect(await lists.findByOwner(ME)).toEqual([]);
  });

  it('says so when MusicBrainz cannot be asked, rather than that the album is unknown', async () => {
    lookUpAlbum.mockResolvedValue({ status: 'lookup_failed' });

    await expect(createList(deps, ME, input(['rg-blue']), NOW)).rejects.toBeInstanceOf(
      AlbumLookupUnavailableError,
    );
  });

  it('refuses more albums than the list holds', async () => {
    await expect(
      createList(deps, ME, input(['rg-blue', 'rg-nevermind', 'rg-thriller', 'rg-abbey']), NOW),
    ).rejects.toBeInstanceOf(InvalidListError);
    expect(lookUpAlbum).not.toHaveBeenCalled();
  });

  it('refuses the same album twice', async () => {
    await expect(createList(deps, ME, input(['rg-blue', 'rg-blue']), NOW)).rejects.toBeInstanceOf(
      InvalidListError,
    );
  });

  it('refuses a second list of the same kind for one owner', async () => {
    await createList(deps, ME, input([]), NOW);

    await expect(createList(deps, ME, input([]), NOW)).rejects.toThrow('already has a list');
  });
});

describe('replaceListAlbums', () => {
  it('puts in the new albums in their new order', async () => {
    const { id } = await createList(deps, ME, input(['rg-blue', 'rg-nevermind']), NOW);

    const changed = await replaceListAlbums(deps, ME, id, ['rg-nevermind', 'rg-thriller'], NOW);

    expect(changed?.albums.map((album) => album.album)).toEqual(['Nevermind', 'Thriller']);
  });

  it('records when it changed', async () => {
    const { id } = await createList(deps, ME, input([]), NOW);
    const later = new Date(NOW.getTime() + 60_000);

    const changed = await replaceListAlbums(deps, ME, id, ['rg-blue'], later);

    expect(changed?.updatedAt).toBe(later.toISOString());
  });

  it('is nothing to change for someone who does not own the list', async () => {
    const { id } = await createList(deps, ME, input(['rg-blue']), NOW);

    expect(await replaceListAlbums(deps, SOMEONE_ELSE, id, [], NOW)).toBeNull();
    expect((await getList(deps, ME, id, NOW))?.albums).toHaveLength(1);
  });

  it('refuses an album MusicBrainz does not know, and leaves the list as it was', async () => {
    const { id } = await createList(deps, ME, input(['rg-blue']), NOW);

    await expect(replaceListAlbums(deps, ME, id, ['rg-made-up'], NOW)).rejects.toBeInstanceOf(
      UnknownAlbumError,
    );
    expect((await getList(deps, ME, id, NOW))?.albums.map((a) => a.album)).toEqual([
      'Kind of Blue',
    ]);
  });

  it('refuses too many albums, and the same album twice', async () => {
    const { id } = await createList(deps, ME, input([]), NOW);

    await expect(
      replaceListAlbums(deps, ME, id, ['rg-blue', 'rg-nevermind', 'rg-thriller', 'rg-abbey'], NOW),
    ).rejects.toBeInstanceOf(InvalidListError);
    await expect(
      replaceListAlbums(deps, ME, id, ['rg-blue', 'rg-blue'], NOW),
    ).rejects.toBeInstanceOf(InvalidListError);
  });
});

describe('getList', () => {
  it('shows each album with its cover', async () => {
    const { id } = await createList(deps, ME, input(FULL), NOW);

    const list = await getList(deps, null, id, NOW);

    expect(list?.albums[0].artworkUrl).toBe('https://img/cover.jpg');
  });

  it('shows a list to anyone who has its code, and says who owns it', async () => {
    const { id } = await createList(deps, ME, input(FULL), NOW);

    expect((await getList(deps, ME, id, NOW))?.isOwner).toBe(true);
    expect((await getList(deps, SOMEONE_ELSE, id, NOW))?.isOwner).toBe(false);
    expect((await getList(deps, null, id, NOW))?.isOwner).toBe(false);
  });

  it('shows a list that is not finished to its owner only, since it is only shared once full', async () => {
    const { id } = await createList(deps, ME, input(['rg-blue', 'rg-nevermind']), NOW);

    expect((await getList(deps, ME, id, NOW))?.albums).toHaveLength(2);
    expect(await getList(deps, SOMEONE_ELSE, id, NOW)).toBeNull();
    expect(await getList(deps, null, id, NOW)).toBeNull();
  });

  it('finds nothing for a code that was never made', async () => {
    expect(await getList(deps, null, 'nosuchcode', NOW)).toBeNull();
  });

  it('still shows the list when a cover cannot be found', async () => {
    const { fetchArtwork } = await import('./artworkService');
    vi.mocked(fetchArtwork).mockRejectedValueOnce(new Error('Cover Art Archive is down'));
    const { id } = await createList(deps, ME, input(FULL), NOW);

    const list = await getList(deps, null, id, new Date(NOW.getTime() + 1));

    expect(list?.albums[0].album).toBe('Kind of Blue');
  });
});

describe('getOwnLists', () => {
  it('returns the owner’s lists and no one else’s', async () => {
    await createList(deps, ME, input(['rg-blue']), NOW);
    await createList(deps, SOMEONE_ELSE, input(['rg-nevermind']), NOW);

    const mine = await getOwnLists(deps, ME, NOW);

    expect(mine).toHaveLength(1);
    expect(mine[0].albums[0].album).toBe('Kind of Blue');
  });
});

describe('deleteList', () => {
  it('removes the owner’s list, so its code shows nothing', async () => {
    const { id } = await createList(deps, ME, input(['rg-blue']), NOW);

    expect(await deleteList(deps, ME, id)).toBe(true);
    expect(await getList(deps, ME, id, NOW)).toBeNull();
  });

  it('does not remove someone else’s list', async () => {
    const { id } = await createList(deps, ME, input([]), NOW);

    expect(await deleteList(deps, SOMEONE_ELSE, id)).toBe(false);
    expect(await getList(deps, ME, id, NOW)).not.toBeNull();
  });
});
