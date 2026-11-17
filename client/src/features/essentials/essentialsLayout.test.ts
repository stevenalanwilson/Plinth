import { describe, it, expect } from 'vitest';
import { ArtistEssentialsResponse, EssentialAlbum } from '@shared/types';
import { coverArtUrl, layOutEssentials } from './essentialsLayout';

function essential(album: string, year: string, startHere: boolean): EssentialAlbum {
  return { album, year, reason: `Why ${album}.`, releaseGroupId: `rg-${album}`, startHere };
}

const DISCOGRAPHY = [
  { title: 'The Party’s Over', year: '1982', releaseGroupId: 'rg-The Party’s Over' },
  { title: 'It’s My Life', year: '1984', releaseGroupId: 'rg-It’s My Life' },
  { title: 'The Colour of Spring', year: '1986', releaseGroupId: 'rg-The Colour of Spring' },
  { title: 'Spirit of Eden', year: '1988', releaseGroupId: 'rg-Spirit of Eden' },
  { title: 'Laughing Stock', year: '1991', releaseGroupId: 'rg-Laughing Stock' },
];

const ALBUMS = [
  essential('Spirit of Eden', '1988', true),
  essential('The Colour of Spring', '1986', true),
  essential('Laughing Stock', '1991', false),
];

describe('layOutEssentials', () => {
  it('leads with the albums to start with, then the rest of the discography in order', () => {
    const result: ArtistEssentialsResponse = {
      artist: 'Talk Talk',
      albums: ALBUMS,
      discography: DISCOGRAPHY,
    };

    const layout = layOutEssentials(result);

    expect(layout.kind).toBe('discography');
    if (layout.kind !== 'discography') return;
    expect(layout.startHere.map((album) => album.album)).toEqual([
      'Spirit of Eden',
      'The Colour of Spring',
    ]);
    expect(layout.rest.map((row) => row.title)).toEqual([
      'The Party’s Over',
      'It’s My Life',
      'Laughing Stock',
    ]);
  });

  it('attaches the other essentials to their place in the discography', () => {
    const layout = layOutEssentials({
      artist: 'Talk Talk',
      albums: ALBUMS,
      discography: DISCOGRAPHY,
    });

    if (layout.kind !== 'discography') throw new Error('expected a discography');
    expect(layout.rest.find((row) => row.title === 'Laughing Stock')?.essential).toEqual(ALBUMS[2]);
    expect(layout.rest.find((row) => row.title === 'It’s My Life')?.essential).toBeNull();
  });

  it('follows the albums to start with by the other essentials when there is no discography', () => {
    const layout = layOutEssentials({ artist: 'Talk Talk', albums: ALBUMS });

    expect(layout).toEqual({
      kind: 'essentials',
      startHere: [ALBUMS[0], ALBUMS[1]],
      rest: [ALBUMS[2]],
    });
  });

  it('shows one list when nothing is marked to start with', () => {
    const albums = [{ album: 'Spirit of Eden', year: '1988', reason: 'Why.' }];

    expect(layOutEssentials({ artist: 'Talk Talk', albums, discography: DISCOGRAPHY })).toEqual({
      kind: 'list',
      albums,
    });
  });
});

describe('coverArtUrl', () => {
  it('asks the Cover Art Archive for the release group’s front cover', () => {
    expect(coverArtUrl('fd29e2cd-0000-4000-8000-000000000001')).toBe(
      'https://coverartarchive.org/release-group/fd29e2cd-0000-4000-8000-000000000001/front-250',
    );
  });
});
