import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/musicBrainzClient', () => ({ musicBrainzFetch: vi.fn() }));
vi.mock('./albumMatchService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./albumMatchService')>()),
  browseArtistAlbums: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { musicBrainzFetch } from '../repositories/musicBrainzClient';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { AlbumRepository } from '../repositories/albumRepository';
import { browseArtistAlbums, ReleaseGroupCandidate } from './albumMatchService';
import {
  AlbumDetailsUnavailableError,
  chooseRelease,
  getAlbumDetails,
  MusicBrainzRelease,
  relatedAlbums,
  toDiscs,
} from './albumDetailsService';
import { logger } from '../logger';

const mockFetch = vi.mocked(musicBrainzFetch);
const mockBrowseArtistAlbums = vi.mocked(browseArtistAlbums);

const GROUP_ID = 'ae0f7b78-3dce-3157-8dd5-a82251dcf8ef';
const ARTIST_ID = 'b2c36d47-e5e3-4ac8-a967-10e0265d3fff';

function release(overrides: Partial<MusicBrainzRelease> & { id: string }): MusicBrainzRelease {
  return {
    date: '1980',
    country: 'GB',
    'label-info': [{ 'catalog-number': 'KODE 2', label: { name: 'Korova' } }],
    media: [{ format: '12" Vinyl', 'track-count': 11 }],
    'artist-credit': [{ name: 'The Sound', artist: { id: ARTIST_ID, name: 'The Sound' } }],
    ...overrides,
  };
}

const FRENCH_YEAR_ONLY = release({
  id: 'fr',
  date: '1980',
  country: 'FR',
  'label-info': [{ 'catalog-number': 'KOW 58 255', label: { name: 'Korova Records' } }],
});
const UK_ORIGINAL = release({ id: 'uk', date: '1980-11' });
const CD_REISSUE = release({
  id: 'cd',
  date: '2001',
  country: 'GB',
  'label-info': [{ 'catalog-number': 'REN CD4', label: { name: 'Renascent' } }],
  media: [{ format: 'CD', 'track-count': 15 }],
});
const DIGITAL = release({
  id: 'digital',
  date: '2012-04-21',
  country: 'XW',
  'label-info': [{ label: { name: 'Rhino' } }],
  media: [{ format: 'Digital Media', 'track-count': 11 }],
});

const TRACKLIST = {
  media: [
    {
      position: 1,
      title: '',
      format: '12" Vinyl',
      tracks: [
        { number: 'A1', position: 1, title: "I Can't Escape Myself", length: 235_813 },
        { number: 'A2', position: 2, title: 'Heartland', length: 216_346 },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function candidate(
  id: string,
  title: string,
  date: string | undefined,
  secondaryTypes: readonly string[] = [],
): ReleaseGroupCandidate {
  return {
    id,
    title,
    'primary-type': 'Album',
    'secondary-types': secondaryTypes,
    ...(date ? { 'first-release-date': date } : {}),
  };
}

describe('chooseRelease', () => {
  it('picks the earliest release', () => {
    expect(chooseRelease([CD_REISSUE, UK_ORIGINAL, DIGITAL])?.id).toBe('uk');
  });

  it('counts a year-only date as the end of that year, so a precise date earlier in it wins', () => {
    expect(chooseRelease([FRENCH_YEAR_ONLY, UK_ORIGINAL])?.id).toBe('uk');
    expect(chooseRelease([UK_ORIGINAL, FRENCH_YEAR_ONLY])?.id).toBe('uk');
  });

  it('puts an undated release after every dated one', () => {
    expect(chooseRelease([release({ id: 'undated', date: undefined }), CD_REISSUE])?.id).toBe('cd');
  });

  it('still returns an undated release when it is the only one', () => {
    expect(chooseRelease([release({ id: 'undated', date: undefined })])?.id).toBe('undated');
  });

  it('skips a release with no tracks, such as a data-only entry', () => {
    const empty = release({
      id: 'empty',
      date: '1979',
      media: [{ format: 'CD', 'track-count': 0 }],
    });

    expect(chooseRelease([empty, CD_REISSUE])?.id).toBe('cd');
  });

  it('returns null when there is nothing to choose from', () => {
    expect(chooseRelease([])).toBeNull();
    expect(
      chooseRelease([release({ id: 'empty', media: [{ format: 'CD', 'track-count': 0 }] })]),
    ).toBeNull();
  });
});

describe('toDiscs', () => {
  it('maps each disc and keeps the numbers printed on the release', () => {
    expect(toDiscs(TRACKLIST.media)).toEqual([
      {
        position: 1,
        title: null,
        format: '12" Vinyl',
        tracks: [
          { number: 'A1', title: "I Can't Escape Myself", lengthSeconds: 236 },
          { number: 'A2', title: 'Heartland', lengthSeconds: 216 },
        ],
      },
    ]);
  });

  it('falls back to the position when a track has no number, and to null for no length', () => {
    const [disc] = toDiscs([
      { position: 2, title: 'Bonus disc', tracks: [{ position: 7, title: 'Demo' }] },
    ]);

    expect(disc).toEqual({
      position: 2,
      title: 'Bonus disc',
      format: null,
      tracks: [{ number: '7', title: 'Demo', lengthSeconds: null }],
    });
  });

  it('drops a disc with no tracks', () => {
    expect(toDiscs([{ position: 1, tracks: [] }, { position: 2 }])).toEqual([]);
  });
});

describe('relatedAlbums', () => {
  const catalogue = [
    candidate('rg-2', 'From the Lion’s Mouth', '1981-09'),
    candidate(GROUP_ID, 'Jeopardy', '1980-11'),
    candidate('rg-3', 'All Fall Down', '1982'),
    candidate('rg-live', 'In the Hothouse', '1985', ['Live']),
    candidate('rg-comp', 'Shock of Daylight', '1984', ['Compilation']),
    candidate('rg-undated', 'Demos', undefined),
  ];

  it('lists the other studio albums in release order, leaving out this one', () => {
    expect(relatedAlbums(catalogue, GROUP_ID)).toEqual([
      { title: 'From the Lion’s Mouth', year: '1981' },
      { title: 'All Fall Down', year: '1982' },
      { title: 'Demos', year: null },
    ]);
  });

  it('shows at most ten albums', () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      candidate(`rg-${index}`, `Album ${index}`, `${1970 + index}`),
    );

    const albums = relatedAlbums(many, GROUP_ID);

    expect(albums).toHaveLength(10);
    expect(albums[0].title).toBe('Album 0');
  });
});

describe('getAlbumDetails', () => {
  let albums: AlbumRepository;

  beforeEach(async () => {
    vi.clearAllMocks();
    albums = createInMemoryAlbumRepository();
    await albums.insert({
      releaseGroupId: GROUP_ID,
      slug: 'the-sound-jeopardy',
      artist: 'The Sound',
      album: 'Jeopardy',
      year: '1980',
      hook: null,
      genres: [],
      country: null,
    });
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({
            'release-count': 4,
            releases: [CD_REISSUE, UK_ORIGINAL, FRENCH_YEAR_ONLY, DIGITAL],
          })
        : jsonResponse(TRACKLIST),
    );
    mockBrowseArtistAlbums.mockResolvedValue([
      candidate(GROUP_ID, 'Jeopardy', '1980-11'),
      candidate('rg-2', 'From the Lion’s Mouth', '1981-09'),
    ]);
  });

  it('returns null for an album that is not stored, without asking MusicBrainz', async () => {
    expect(await getAlbumDetails(albums, 'nope')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('assembles the release, formats, tracklist and more from the artist', async () => {
    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details).toEqual({
      release: { date: '1980-11', country: 'GB', label: 'Korova', catalogueNumber: 'KODE 2' },
      formats: ['12" Vinyl', 'CD', 'Digital Media'],
      discs: [
        {
          position: 1,
          title: null,
          format: '12" Vinyl',
          tracks: [
            { number: 'A1', title: "I Can't Escape Myself", lengthSeconds: 236 },
            { number: 'A2', title: 'Heartland', lengthSeconds: 216 },
          ],
        },
      ],
      moreFromArtist: {
        artist: 'The Sound',
        albums: [{ title: 'From the Lion’s Mouth', year: '1981' }],
      },
    });
  });

  it('looks the tracklist up on the release it chose, and the artist by their MusicBrainz ID', async () => {
    await getAlbumDetails(albums, 'the-sound-jeopardy');

    const paths = mockFetch.mock.calls.map(([path]) => path);
    expect(paths[0]).toBe(
      `release?release-group=${GROUP_ID}&status=official&inc=media+labels+artist-credits&limit=100&offset=0&fmt=json`,
    );
    expect(paths[1]).toBe('release/uk?inc=recordings&fmt=json');
    expect(mockBrowseArtistAlbums).toHaveBeenCalledWith(
      ARTIST_ID,
      expect.any(AbortSignal),
      'listed',
    );
  });

  it('lists each format once, in the order the album was released on it', async () => {
    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details?.formats).toEqual(['12" Vinyl', 'CD', 'Digital Media']);
  });

  it('leaves out a bare "Vinyl" when a sized vinyl format is listed, since it is the same thing', async () => {
    const bareVinyl = release({
      id: 'bare',
      date: '1983',
      media: [{ format: 'Vinyl', 'track-count': 11 }],
    });
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({ 'release-count': 3, releases: [UK_ORIGINAL, bareVinyl, CD_REISSUE] })
        : jsonResponse(TRACKLIST),
    );

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details?.formats).toEqual(['12" Vinyl', 'CD']);
  });

  it('keeps a bare "Vinyl" when nothing more specific is listed', async () => {
    const bareVinyl = release({
      id: 'bare',
      date: '1983',
      media: [{ format: 'Vinyl', 'track-count': 11 }],
    });
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({ 'release-count': 2, releases: [bareVinyl, CD_REISSUE] })
        : jsonResponse(TRACKLIST),
    );

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details?.formats).toEqual(['Vinyl', 'CD']);
  });

  it('reads more pages for an album with more than 100 releases, and stops when it has them all', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (!path.startsWith('release?')) return jsonResponse(TRACKLIST);
      const offset = Number(/offset=(\d+)/.exec(path)?.[1]);
      // 150 releases in all: a full page of 100, then the last 50, with the original pressing
      // only on the second page.
      const page =
        offset === 0
          ? Array.from({ length: 100 }, () => CD_REISSUE)
          : [UK_ORIGINAL, ...Array.from({ length: 49 }, () => CD_REISSUE)];
      return jsonResponse({ 'release-count': 150, releases: page });
    });

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    const browses = mockFetch.mock.calls.filter(([path]) => path.startsWith('release?'));
    expect(browses).toHaveLength(2);
    expect(browses[1][0]).toContain('offset=100');
    expect(details?.release?.date).toBe('1980-11');
  });

  it('reads at most three pages of releases', async () => {
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({ 'release-count': 5000, releases: [CD_REISSUE] })
        : jsonResponse(TRACKLIST),
    );

    await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(mockFetch.mock.calls.filter(([path]) => path.startsWith('release?'))).toHaveLength(3);
  });

  it('throws when the releases cannot be looked up, so nothing half-empty is shown or kept', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'busy' }, 503));

    await expect(getAlbumDetails(albums, 'the-sound-jeopardy')).rejects.toBeInstanceOf(
      AlbumDetailsUnavailableError,
    );
  });

  it('throws when the tracklist cannot be looked up', async () => {
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({ 'release-count': 1, releases: [UK_ORIGINAL] })
        : jsonResponse({ error: 'busy' }, 503),
    );

    await expect(getAlbumDetails(albums, 'the-sound-jeopardy')).rejects.toBeInstanceOf(
      AlbumDetailsUnavailableError,
    );
  });

  it('returns empty details for an album with no official releases', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ 'release-count': 0, releases: [] }));

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details).toEqual({ release: null, formats: [], discs: [], moreFromArtist: null });
    expect(mockBrowseArtistAlbums).not.toHaveBeenCalled();
  });

  it('still returns everything else when the artist’s other albums cannot be looked up', async () => {
    mockBrowseArtistAlbums.mockResolvedValue(null);

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details?.moreFromArtist).toBeNull();
    expect(details?.discs).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'the-sound-jeopardy' }),
      'album details: artist albums unavailable',
    );
  });

  it('does not list "more from" for Various Artists, whose catalogue is not one act’s albums', async () => {
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({
            'release-count': 1,
            releases: [
              release({
                id: 'comp',
                'artist-credit': [
                  {
                    name: 'Various Artists',
                    artist: { id: '89ad4ac3-39f7-470e-963a-56509c546377', name: 'Various Artists' },
                  },
                ],
              }),
            ],
          })
        : jsonResponse(TRACKLIST),
    );

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details?.moreFromArtist).toBeNull();
    expect(mockBrowseArtistAlbums).not.toHaveBeenCalled();
  });

  it('copes with a release that has no label or country', async () => {
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('release?')
        ? jsonResponse({
            'release-count': 1,
            releases: [release({ id: 'bare', country: undefined, 'label-info': [] })],
          })
        : jsonResponse(TRACKLIST),
    );

    const details = await getAlbumDetails(albums, 'the-sound-jeopardy');

    expect(details?.release).toEqual({
      date: '1980',
      country: null,
      label: null,
      catalogueNumber: null,
    });
  });
});
