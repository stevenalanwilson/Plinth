import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

vi.mock('./albumMatchService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./albumMatchService')>()),
  findArtistAlbums: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import Anthropic from '@anthropic-ai/sdk';
import {
  getArtistEssentials,
  buildDiscography,
  buildPrompt,
  markStartHere,
  toArtistEssentials,
  UnverifiedEssentialsError,
  verifyEssentials,
} from './artistEssentialsService';
import { EssentialAlbum } from '@shared/types';
import { findArtistAlbums, ReleaseGroupCandidate } from './albumMatchService';
import { CacheStore } from '../repositories/cacheStore';
import { createInMemoryCacheStore } from '../repositories/inMemoryCacheStore';
import { configureLookupCache } from '../repositories/lookupCache';

const mockCreate = vi.fn();
const mockFindArtistAlbums = vi.mocked(findArtistAlbums);

function catalogueAlbum(
  title: string,
  year: string,
  secondaryTypes: readonly string[] = [],
): ReleaseGroupCandidate {
  return {
    id: `rg-${title}`,
    title,
    'primary-type': 'Album',
    'secondary-types': secondaryTypes,
    'first-release-date': year,
    'artist-credit': [{ name: 'Talk Talk' }],
  };
}

const talkTalkCatalogue = [
  catalogueAlbum('The Party’s Over', '1982'),
  catalogueAlbum('It’s My Life', '1984'),
  catalogueAlbum('The Colour of Spring', '1986'),
  catalogueAlbum('Spirit of Eden', '1988'),
  catalogueAlbum('Laughing Stock', '1991'),
  catalogueAlbum('Natural History', '1990', ['Compilation']),
];

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  mockFindArtistAlbums.mockResolvedValue({
    status: 'found',
    artist: 'Talk Talk',
    albums: talkTalkCatalogue,
  });
});

const validAlbums = [
  { album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' },
  { album: 'Laughing Stock', year: '1991', reason: 'The culmination of their art.' },
  { album: "It's My Life", year: '1984', reason: 'Accessible early new wave.' },
  { album: "It's My Life 2", year: '1985', reason: 'Follow-up.' },
  { album: 'The Colour of Spring', year: '1986', reason: 'Key transitional album.' },
];

const validJsonResponse = JSON.stringify({
  artist: 'Talk Talk',
  albums: validAlbums,
});

describe('buildPrompt', () => {
  it('includes the artist name in the output', () => {
    const prompt = buildPrompt('Talk Talk');
    expect(prompt).toContain('Talk Talk');
  });

  it('mentions essential', () => {
    const prompt = buildPrompt('Talk Talk');
    expect(prompt.toLowerCase()).toContain('essential');
  });

  it('asks for the two or three albums to start with', () => {
    const prompt = buildPrompt('Talk Talk');
    expect(prompt).toContain('two or three albums a newcomer should start with');
    expect(prompt).toContain('"startHere": true');
  });
});

describe('toArtistEssentials', () => {
  it('maps a valid response', () => {
    const result = toArtistEssentials(JSON.parse(validJsonResponse));
    expect(result.artist).toBe('Talk Talk');
    expect(result.albums).toHaveLength(5);
    expect(result.albums[0].album).toBe('Spirit of Eden');
  });

  it('keeps the start-here mark', () => {
    const result = toArtistEssentials({
      artist: 'Talk Talk',
      albums: [
        { album: 'Spirit of Eden', year: '1988', reason: 'A.', startHere: true },
        { album: 'Laughing Stock', year: '1991', reason: 'B.', startHere: false },
      ],
    });
    expect(result.albums.map((album) => album.startHere)).toEqual([true, false]);
  });

  it('treats a missing or non-boolean mark as not marked', () => {
    const result = toArtistEssentials({
      artist: 'Talk Talk',
      albums: [
        { album: 'Spirit of Eden', year: '1988', reason: 'A.' },
        { album: 'Laughing Stock', year: '1991', reason: 'B.', startHere: 'yes' },
      ],
    });
    expect(result.albums.map((album) => album.startHere)).toEqual([false, false]);
  });

  it('coerces numeric year to string', () => {
    const json = JSON.stringify({
      artist: 'Talk Talk',
      albums: [{ album: 'Spirit of Eden', year: 1988, reason: 'Great.' }],
    });
    const result = toArtistEssentials(JSON.parse(json));
    expect(result.albums[0].year).toBe('1988');
  });

  it('slices albums to a maximum of 8', () => {
    const manyAlbums = Array.from({ length: 12 }, (_, i) => ({
      album: `Album ${i}`,
      year: '2000',
      reason: 'Reason.',
    }));
    const json = JSON.stringify({ artist: 'Artist', albums: manyAlbums });
    const result = toArtistEssentials(JSON.parse(json));
    expect(result.albums).toHaveLength(8);
  });

  it('throws when artist field is missing', () => {
    const json = JSON.stringify({ albums: validAlbums });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });

  it('throws when albums field is missing', () => {
    const json = JSON.stringify({ artist: 'Talk Talk' });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });

  it('throws when albums is an empty array', () => {
    const json = JSON.stringify({ artist: 'Talk Talk', albums: [] });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });

  it('throws when an album entry is missing required fields', () => {
    const json = JSON.stringify({
      artist: 'Talk Talk',
      albums: [{ album: 'Spirit of Eden' }],
    });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });
});

describe('getArtistEssentials', () => {
  it('returns a parsed response on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.artist).toBe('Talk Talk');
    expect(result.albums.length).toBeGreaterThan(0);
  });

  it('throws when there is no text content in the API response', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toThrow();
  });

  it('throws when the API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'));

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toThrow('Network error');
  });
});

function essentialsWithMarks(
  albums: readonly (readonly [string, boolean])[],
): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          artist: 'Talk Talk',
          albums: albums.map(([album, startHere]) => ({
            album,
            year: '1988',
            reason: 'Essential.',
            startHere,
          })),
        }),
      },
    ],
  };
}

function claudeEssentials(artist: string, albums: readonly string[]): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          artist,
          albums: albums.map((album) => ({ album, year: '1988', reason: 'Essential.' })),
        }),
      },
    ],
  };
}

describe('verifyEssentials', () => {
  it('keeps catalogue albums in order with MusicBrainz spellings and years', () => {
    const result = verifyEssentials(
      toArtistEssentials(JSON.parse(validJsonResponse)),
      'Talk Talk',
      talkTalkCatalogue,
    );

    expect(result.essentials.albums.map((album) => album.album)).toEqual([
      'Spirit of Eden',
      'Laughing Stock',
      'It’s My Life',
      'The Colour of Spring',
    ]);
    expect(result.essentials.albums[2]).toMatchObject({
      year: '1984',
      releaseGroupId: 'rg-It’s My Life',
    });
    expect(result.notFound).toEqual(["It's My Life 2"]);
  });

  it('drops a second entry for the same album', () => {
    const result = verifyEssentials(
      { artist: 'Talk Talk', albums: [validAlbums[0], { ...validAlbums[0], year: '1989' }] },
      'Talk Talk',
      talkTalkCatalogue,
    );

    expect(result.essentials.albums).toHaveLength(1);
  });
});

function essential(album: string, startHere: boolean): EssentialAlbum {
  return { album, year: '1988', reason: 'Essential.', startHere };
}

function startHereTitles(albums: readonly EssentialAlbum[]): string[] {
  return albums.filter((album) => album.startHere).map((album) => album.album);
}

describe('markStartHere', () => {
  it('keeps two or three albums Claude marked', () => {
    const albums = [essential('A', false), essential('B', true), essential('C', true)];

    expect(startHereTitles(markStartHere(albums))).toEqual(['B', 'C']);
  });

  it('keeps only the first three when more are marked', () => {
    const albums = ['A', 'B', 'C', 'D', 'E'].map((title) => essential(title, true));

    expect(startHereTitles(markStartHere(albums))).toEqual(['A', 'B', 'C']);
  });

  it('marks the first two when none are marked', () => {
    const albums = ['A', 'B', 'C', 'D'].map((title) => essential(title, false));

    expect(startHereTitles(markStartHere(albums))).toEqual(['A', 'B']);
  });

  it('adds the first unmarked album when only one is marked', () => {
    const albums = [essential('A', false), essential('B', false), essential('C', true)];

    expect(startHereTitles(markStartHere(albums))).toEqual(['A', 'C']);
  });

  it('marks the only album of a one-album list', () => {
    expect(startHereTitles(markStartHere([essential('A', false)]))).toEqual(['A']);
  });

  it('keeps the albums in Claude’s order', () => {
    const albums = [essential('A', false), essential('B', true), essential('C', true)];

    expect(markStartHere(albums).map((album) => album.album)).toEqual(['A', 'B', 'C']);
  });
});

describe('buildDiscography', () => {
  it('lists studio albums oldest first, with MusicBrainz titles and years', () => {
    const shuffled = [talkTalkCatalogue[4], talkTalkCatalogue[0], talkTalkCatalogue[3]];

    expect(buildDiscography(shuffled, [])).toEqual([
      { title: 'The Party’s Over', year: '1982', releaseGroupId: 'rg-The Party’s Over' },
      { title: 'Spirit of Eden', year: '1988', releaseGroupId: 'rg-Spirit of Eden' },
      { title: 'Laughing Stock', year: '1991', releaseGroupId: 'rg-Laughing Stock' },
    ]);
  });

  it('leaves out compilations and live albums', () => {
    const titles = buildDiscography(talkTalkCatalogue, []).map((album) => album.title);

    expect(titles).not.toContain('Natural History');
    expect(titles).toHaveLength(5);
  });

  it('keeps an essential album that isn’t a studio album', () => {
    const live = catalogueAlbum('London 1986', '1999', ['Live']);
    const essentials = [{ ...essential('London 1986', true), releaseGroupId: live.id }];

    const titles = buildDiscography([...talkTalkCatalogue, live], essentials).map(
      (album) => album.title,
    );

    expect(titles).toContain('London 1986');
    expect(titles).not.toContain('Natural History');
  });

  it('puts a year alone after a fuller date in the same year, and undated albums last', () => {
    const catalogue = [
      catalogueAlbum('Undated', ''),
      catalogueAlbum('Sometime 1986', '1986'),
      catalogueAlbum('March 1986', '1986-03-01'),
    ];

    expect(buildDiscography(catalogue, [])).toEqual([
      { title: 'March 1986', year: '1986', releaseGroupId: 'rg-March 1986' },
      { title: 'Sometime 1986', year: '1986', releaseGroupId: 'rg-Sometime 1986' },
      { title: 'Undated', year: null, releaseGroupId: 'rg-Undated' },
    ]);
  });
});

describe('getArtistEssentials album check', () => {
  it('returns only albums found in MusicBrainz', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: validJsonResponse }] });

    const result = await getArtistEssentials({ artist: 'talk talk' });

    expect(result.artist).toBe('Talk Talk');
    expect(result.albums.map((album) => album.album)).not.toContain("It's My Life 2");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('asks again with the real catalogue when fewer than three albums check out', async () => {
    mockCreate
      .mockResolvedValueOnce(
        claudeEssentials('Talk Talk', ['Spirit of Eden', 'Made Up One', 'Made Up Two']),
      )
      .mockResolvedValueOnce(
        claudeEssentials('Talk Talk', ['Spirit of Eden', 'Laughing Stock', 'The Colour of Spring']),
      );

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums).toHaveLength(3);
    const retryPrompt = mockCreate.mock.calls[1][0].messages[0].content as string;
    expect(retryPrompt).toContain('Made Up One, Made Up Two');
    expect(retryPrompt).toContain('Laughing Stock');
    expect(retryPrompt).not.toContain('Natural History');
  });

  it('keeps the first answer if the retry checks out worse', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeEssentials('Talk Talk', ['Spirit of Eden', 'Laughing Stock']))
      .mockResolvedValueOnce(claudeEssentials('Talk Talk', ['Made Up One']));

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums.map((album) => album.album)).toEqual(['Spirit of Eden', 'Laughing Stock']);
  });

  it('fails when no album can be verified', async () => {
    mockCreate.mockResolvedValue(claudeEssentials('Talk Talk', ['Made Up One']));

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toBeInstanceOf(
      UnverifiedEssentialsError,
    );
  });

  it('fails when the artist is not in MusicBrainz', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: validJsonResponse }] });
    mockFindArtistAlbums.mockResolvedValue({ status: 'not_found' });

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toBeInstanceOf(
      UnverifiedEssentialsError,
    );
  });

  it('retries the lookup with Claude’s spelling of a mistyped artist', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: validJsonResponse }] });
    mockFindArtistAlbums.mockResolvedValueOnce({ status: 'not_found' });

    const result = await getArtistEssentials({ artist: 'Tlak Talk' });

    expect(mockFindArtistAlbums).toHaveBeenLastCalledWith('Talk Talk');
    expect(result.albums.length).toBeGreaterThan(0);
  });

  it('returns the list unchecked when MusicBrainz is unavailable', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: validJsonResponse }] });
    mockFindArtistAlbums.mockResolvedValue({ status: 'lookup_failed' });

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums).toHaveLength(5);
    expect(result.albums[0].releaseGroupId).toBeUndefined();
    expect(result.discography).toBeUndefined();
    expect(startHereTitles(result.albums)).toHaveLength(2);
  });

  it('includes the discography and the albums to start with', async () => {
    mockCreate.mockResolvedValue(
      essentialsWithMarks([
        ['Spirit of Eden', true],
        ['Laughing Stock', false],
        ['The Colour of Spring', true],
      ]),
    );

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(startHereTitles(result.albums)).toEqual(['Spirit of Eden', 'The Colour of Spring']);
    expect(result.discography?.map((album) => album.title)).toEqual([
      'The Party’s Over',
      'It’s My Life',
      'The Colour of Spring',
      'Spirit of Eden',
      'Laughing Stock',
    ]);
  });

  it('replaces a start-here album that MusicBrainz doesn’t have with the next one', async () => {
    mockCreate.mockResolvedValue(
      essentialsWithMarks([
        ['Made Up One', true],
        ['Spirit of Eden', true],
        ['Laughing Stock', false],
        ['The Colour of Spring', false],
      ]),
    );

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(startHereTitles(result.albums)).toEqual(['Spirit of Eden', 'Laughing Stock']);
  });
});

describe('getArtistEssentials cache', () => {
  const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
  let store: CacheStore;

  beforeEach(() => {
    store = createInMemoryCacheStore();
    configureLookupCache(store);
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: validJsonResponse }] });
  });

  afterEach(() => {
    configureLookupCache(null);
  });

  it('answers a repeat request without calling Claude or MusicBrainz', async () => {
    const first = await getArtistEssentials({ artist: 'Talk Talk' });
    mockFindArtistAlbums.mockClear();

    const second = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(second).toEqual(first);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockFindArtistAlbums).not.toHaveBeenCalled();
  });

  it.each(['talk talk', '  TALK TALK  ', 'Talk-Talk', 'The Talk Talk'])(
    'treats %s as the same artist',
    async (spelling) => {
      await getArtistEssentials({ artist: 'Talk Talk' });

      await getArtistEssentials({ artist: spelling });

      expect(mockCreate).toHaveBeenCalledTimes(1);
    },
  );

  it('asks again for a different artist', async () => {
    await getArtistEssentials({ artist: 'Talk Talk' });

    await getArtistEssentials({ artist: 'Mark Hollis' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('keeps a verified list for 30 days', async () => {
    const set = vi.spyOn(store, 'set');

    await getArtistEssentials({ artist: 'Talk Talk' });

    expect(set).toHaveBeenCalledWith(
      expect.stringContaining('essentials:'),
      expect.anything(),
      THIRTY_DAYS_SECONDS,
    );
  });

  it('does not keep a list that went out unchecked because MusicBrainz was down', async () => {
    mockFindArtistAlbums.mockResolvedValue({ status: 'lookup_failed' });
    await getArtistEssentials({ artist: 'Talk Talk' });

    mockFindArtistAlbums.mockResolvedValue({
      status: 'found',
      artist: 'Talk Talk',
      albums: talkTalkCatalogue,
    });
    const recovered = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(recovered.albums.every((album) => album.releaseGroupId !== undefined)).toBe(true);
  });

  it('does not keep a failure', async () => {
    mockFindArtistAlbums.mockResolvedValue({ status: 'not_found' });
    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toBeInstanceOf(
      UnverifiedEssentialsError,
    );

    mockFindArtistAlbums.mockResolvedValue({
      status: 'found',
      artist: 'Talk Talk',
      albums: talkTalkCatalogue,
    });

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).resolves.toMatchObject({
      artist: 'Talk Talk',
    });
  });

  it('keeps lists under a new version, leaving ones from before the discography behind', async () => {
    const set = vi.spyOn(store, 'set');

    await getArtistEssentials({ artist: 'Talk Talk' });

    expect(set).toHaveBeenCalledWith(
      'essentials:v2:talk talk',
      expect.anything(),
      expect.anything(),
    );
  });

  it('ignores a cached list without a discography and asks again', async () => {
    const first = await getArtistEssentials({ artist: 'Talk Talk' });
    await store.set('essentials:v2:talk talk', { artist: first.artist, albums: first.albums }, 60);

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.discography).toBeDefined();
  });

  it('ignores a cached entry that no longer has the right shape and asks again', async () => {
    await getArtistEssentials({ artist: 'Talk Talk' });
    // Overwrite the stored list with something an older version might have written.
    await store.set('essentials:v2:talk talk', { artist: 'Talk Talk', albums: 'nope' }, 60);

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.albums.length).toBeGreaterThan(0);
  });
});
