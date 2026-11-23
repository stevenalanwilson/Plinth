import { describe, it, expect } from 'vitest';
import { AlbumResponse } from '@shared/types';
import { HistoryEntry } from '../../types/history';
import {
  addAlbum,
  albumsInCrate,
  fromListAlbums,
  hasChanged,
  moveAlbum,
  moveAlbumTo,
  PickedAlbum,
  removeAlbumAt,
  TOP_THREE_SIZE,
} from './topThree';

function album(id: string, overrides: Partial<PickedAlbum> = {}): PickedAlbum {
  return {
    releaseGroupId: id,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    year: '1999',
    ...overrides,
  };
}

const A = album('a');
const B = album('b');
const C = album('c');
const D = album('d');

const ids = (albums: readonly PickedAlbum[]): string[] => albums.map((a) => a.releaseGroupId);

describe('addAlbum', () => {
  it('puts the album last', () => {
    expect(ids(addAlbum([A], B))).toEqual(['a', 'b']);
  });

  it('does not change the list it was given', () => {
    const before = [A];

    addAlbum(before, B);

    expect(before).toEqual([A]);
  });

  it('leaves a full list as it is', () => {
    expect(TOP_THREE_SIZE).toBe(3);
    expect(ids(addAlbum([A, B, C], D))).toEqual(['a', 'b', 'c']);
  });

  it('leaves the list as it is when the album is already in it', () => {
    expect(ids(addAlbum([A, B], album('a', { album: 'Another spelling' })))).toEqual(['a', 'b']);
  });
});

describe('removeAlbumAt', () => {
  it('takes the album out and closes the gap', () => {
    expect(ids(removeAlbumAt([A, B, C], 1))).toEqual(['a', 'c']);
  });

  it.each([[-1], [3], [1.5]])(
    'leaves the list alone for position %s, which is not in it',
    (index) => {
      expect(ids(removeAlbumAt([A, B, C], index))).toEqual(['a', 'b', 'c']);
    },
  );
});

describe('moveAlbum', () => {
  it('moves an album up', () => {
    expect(ids(moveAlbum([A, B, C], 1, -1))).toEqual(['b', 'a', 'c']);
  });

  it('moves an album down', () => {
    expect(ids(moveAlbum([A, B, C], 1, 1))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the first album where it is when asked to move it up', () => {
    expect(ids(moveAlbum([A, B, C], 0, -1))).toEqual(['a', 'b', 'c']);
  });

  it('leaves the last album where it is when asked to move it down', () => {
    expect(ids(moveAlbum([A, B, C], 2, 1))).toEqual(['a', 'b', 'c']);
  });

  it('does not move the last of a part-filled list down into an empty slot', () => {
    expect(ids(moveAlbum([A, B], 1, 1))).toEqual(['a', 'b']);
  });
});

describe('moveAlbumTo', () => {
  it('moves an album to a later place, the ones between shifting up', () => {
    expect(ids(moveAlbumTo([A, B, C], 0, 2))).toEqual(['b', 'c', 'a']);
  });

  it('moves an album to an earlier place, the ones between shifting down', () => {
    expect(ids(moveAlbumTo([A, B, C], 2, 0))).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list alone when dropped where it was, or off the list', () => {
    expect(ids(moveAlbumTo([A, B, C], 1, 1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveAlbumTo([A, B], 0, 2))).toEqual(['a', 'b']);
    expect(ids(moveAlbumTo([A, B], -1, 0))).toEqual(['a', 'b']);
  });
});

describe('hasChanged', () => {
  it('is false for the same albums in the same order', () => {
    expect(hasChanged([A, B], [A, B])).toBe(false);
  });

  it('is true for a different order, a different album, or a different length', () => {
    expect(hasChanged([A, B], [B, A])).toBe(true);
    expect(hasChanged([A, B], [A, C])).toBe(true);
    expect(hasChanged([A, B], [A])).toBe(true);
  });

  it('goes by the album, not how its name is written', () => {
    expect(hasChanged([A], [album('a', { album: 'Another spelling' })])).toBe(false);
  });
});

describe('fromListAlbums', () => {
  it('keeps what is shown of each saved album, in order', () => {
    const saved: AlbumResponse[] = [
      {
        slug: 'artist-a-album-a',
        releaseGroupId: 'a',
        artist: 'Artist a',
        album: 'Album a',
        year: '1999',
        hook: null,
        genres: [],
        country: null,
        artworkUrl: 'https://img/a.jpg',
        appleMusicUrl: null,
      },
      {
        slug: 'x',
        releaseGroupId: 'b',
        artist: 'Artist b',
        album: 'Album b',
        year: null,
        hook: null,
        genres: [],
        country: null,
        artworkUrl: null,
        appleMusicUrl: null,
      },
    ];

    expect(fromListAlbums(saved)).toEqual([
      { releaseGroupId: 'a', artist: 'Artist a', album: 'Album a', year: '1999' },
      { releaseGroupId: 'b', artist: 'Artist b', album: 'Album b', year: null },
    ]);
  });
});

describe('albumsInCrate', () => {
  function entry(
    id: string,
    recommendation: Partial<HistoryEntry['recommendation']>,
  ): HistoryEntry {
    return {
      id,
      recommendation: { artist: 'A', album: 'B', year: '1971', reason: 'r', ...recommendation },
      artworkResponse: { artworkUrl: null, year: null, appleMusicUrl: null },
      createdAt: '2026-11-01T00:00:00.000Z',
    };
  }

  it('offers the albums that MusicBrainz confirmed, as they are named there', () => {
    const crate = [
      entry('1', { artist: 'Can', album: 'Tago Mago', year: '1971', releaseGroupId: 'rg-1' }),
    ];

    expect(albumsInCrate(crate)).toEqual([
      { releaseGroupId: 'rg-1', artist: 'Can', album: 'Tago Mago', year: '1971' },
    ]);
  });

  it('leaves out picks that could not be checked, which a list cannot hold', () => {
    expect(albumsInCrate([entry('1', {})])).toEqual([]);
  });

  it('offers an album once, even if it was picked twice', () => {
    const crate = [entry('1', { releaseGroupId: 'rg-1' }), entry('2', { releaseGroupId: 'rg-1' })];

    expect(albumsInCrate(crate)).toHaveLength(1);
  });

  it('gives no year for a pick that had none', () => {
    expect(albumsInCrate([entry('1', { releaseGroupId: 'rg-1', year: '' })])[0].year).toBeNull();
  });
});
