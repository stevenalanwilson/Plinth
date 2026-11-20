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
  findAlbum: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import Anthropic from '@anthropic-ai/sdk';
import {
  getArtistEssentials,
  buildPrompt,
  toArtistEssentials,
  UnverifiedEssentialsError,
  verifyEssentials,
  verifyRelated,
} from './artistEssentialsService';
import { ConnectedAlbum } from '@shared/types';
import {
  AlbumLookup,
  AlbumQuery,
  findAlbum,
  findArtistAlbums,
  ReleaseGroupCandidate,
} from './albumMatchService';
import { CacheStore } from '../repositories/cacheStore';
import { createInMemoryCacheStore } from '../repositories/inMemoryCacheStore';
import { configureLookupCache } from '../repositories/lookupCache';

const mockCreate = vi.fn();
const mockFindArtistAlbums = vi.mocked(findArtistAlbums);
const mockFindAlbum = vi.mocked(findAlbum);

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

// What MusicBrainz knows of the related albums: anything else is not found.
const knownRelated: Record<string, { artist: string; album: string; year: string }> = {
  'mark hollis|mark hollis': { artist: 'Mark Hollis', album: 'Mark Hollis', year: '1998' },
  'o.rang|herd of instinct': { artist: 'O.Rang', album: 'Herd of Instinct', year: '1994' },
  'beth gibbons & rustin man|out of season': {
    artist: 'Beth Gibbons & Rustin’ Man',
    album: 'Out of Season',
    year: '2002',
  },
};

function lookUpRelated(query: AlbumQuery): AlbumLookup {
  const known = knownRelated[`${query.artist.toLowerCase()}|${query.album.toLowerCase()}`];
  if (!known) return { status: 'not_found' };
  return { status: 'matched', match: { ...known, releaseGroupId: `rg-${known.album}` } };
}

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
    listedIds: null,
  });
  mockFindAlbum.mockImplementation(async (query) => lookUpRelated(query));
});

type RelatedEntry = readonly [artist: string, album: string];

const defaultRelated: RelatedEntry[] = [
  ['Mark Hollis', 'Mark Hollis'],
  ['O.Rang', 'Herd of Instinct'],
  ['Beth Gibbons & Rustin Man', 'Out of Season'],
  ['Made Up Band', 'Fake Album'],
];

function claudeAnswer(
  albums: readonly string[],
  related: readonly RelatedEntry[] = defaultRelated,
  artist = 'Talk Talk',
): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          artist,
          albums: albums.map((album) => ({ album, year: '1988', reason: 'Start here.' })),
          related: related.map(([relatedArtist, album]) => ({
            artist: relatedArtist,
            album,
            year: '1998',
            connection: 'Former member',
            reason: 'Essential.',
          })),
        }),
      },
    ],
  };
}

const startHere = ['Spirit of Eden', 'Laughing Stock', 'The Colour of Spring'];

describe('buildPrompt', () => {
  it('includes the artist name', () => {
    expect(buildPrompt('Talk Talk')).toContain('Talk Talk');
  });

  it('asks for the two or three albums to start with', () => {
    const prompt = buildPrompt('Talk Talk');

    expect(prompt).toMatch(/two or three albums by Talk Talk/i);
    expect(prompt).toMatch(/newcomer should start with/i);
  });

  it('asks for essential albums by band members, producers and collaborators', () => {
    const prompt = buildPrompt('Talk Talk');

    expect(prompt).toMatch(/members, past or present/i);
    expect(prompt).toMatch(/producers/i);
    expect(prompt).toMatch(/collaborators/i);
    expect(prompt).toContain('connection');
  });

  it('says not to include the artist’s own albums among the related ones', () => {
    expect(buildPrompt('Talk Talk')).toContain('Never include an album by Talk Talk');
  });

  it('keeps the related albums to people directly connected, not labelmates or similar bands', () => {
    const prompt = buildPrompt('Talk Talk');

    expect(prompt).toContain('direct connection to Talk Talk');
    expect(prompt).toMatch(/Do not include labelmates, contemporaries/);
  });

  it('lists what MusicBrainz could not find, and what it does have, on a retry', () => {
    const prompt = buildPrompt('Talk Talk', {
      notFound: ['Made Up One'],
      knownAlbums: ['Spirit of Eden'],
    });

    expect(prompt).toContain('do NOT list them: Made Up One');
    expect(prompt).toContain('choose the albums to start with from them: Spirit of Eden');
  });
});

describe('toArtistEssentials', () => {
  const valid = {
    artist: 'Talk Talk',
    albums: [{ album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' }],
    related: [
      {
        artist: 'Mark Hollis',
        album: 'Mark Hollis',
        year: '1998',
        connection: 'Singer’s solo album',
        reason: 'Quiet and spare.',
      },
    ],
  };

  it('maps a valid response', () => {
    expect(toArtistEssentials(valid)).toEqual(valid);
  });

  it('coerces a numeric year to a string, for both lists', () => {
    const result = toArtistEssentials({
      ...valid,
      albums: [{ ...valid.albums[0], year: 1988 }],
      related: [{ ...valid.related[0], year: 1998 }],
    });

    expect(result.albums[0].year).toBe('1988');
    expect(result.related[0].year).toBe('1998');
  });

  it('keeps at most three albums to start with and eight related', () => {
    const result = toArtistEssentials({
      ...valid,
      albums: Array.from({ length: 6 }, (_, i) => ({ ...valid.albums[0], album: `A${i}` })),
      related: Array.from({ length: 12 }, (_, i) => ({ ...valid.related[0], album: `R${i}` })),
    });

    expect(result.albums).toHaveLength(3);
    expect(result.related).toHaveLength(8);
  });

  it('treats a missing related list as none', () => {
    expect(toArtistEssentials({ artist: 'Talk Talk', albums: valid.albums }).related).toEqual([]);
  });

  it('leaves out a related album that is not well formed, without losing the rest', () => {
    const result = toArtistEssentials({
      ...valid,
      related: [
        { album: 'No artist', year: '1998', connection: 'x', reason: 'y' },
        ...valid.related,
      ],
    });

    expect(result.related).toEqual(valid.related);
  });

  it('throws when the artist is missing', () => {
    expect(() => toArtistEssentials({ albums: valid.albums })).toThrow();
  });

  it('throws when there are no albums to start with', () => {
    expect(() => toArtistEssentials({ ...valid, albums: [] })).toThrow();
    expect(() => toArtistEssentials({ artist: 'Talk Talk' })).toThrow();
  });

  it('throws when an album to start with is missing fields', () => {
    expect(() => toArtistEssentials({ ...valid, albums: [{ album: 'Only a title' }] })).toThrow();
  });
});

describe('verifyEssentials', () => {
  it('keeps catalogue albums in order with MusicBrainz spellings and years', () => {
    const result = verifyEssentials(
      {
        artist: 'talk talk',
        albums: [
          { album: "It's My Life", year: '1985', reason: 'Accessible.' },
          { album: 'Made Up', year: '1990', reason: 'Not real.' },
        ],
        related: [],
      },
      'Talk Talk',
      talkTalkCatalogue,
    );

    expect(result.essentials.albums).toEqual([
      {
        album: 'It’s My Life',
        year: '1984',
        reason: 'Accessible.',
        releaseGroupId: 'rg-It’s My Life',
      },
    ]);
    expect(result.notFound).toEqual(['Made Up']);
  });

  it('drops a second entry for the same album', () => {
    const result = verifyEssentials(
      {
        artist: 'Talk Talk',
        albums: [
          { album: 'Spirit of Eden', year: '1988', reason: 'One.' },
          { album: 'spirit of eden', year: '1988', reason: 'Two.' },
        ],
        related: [],
      },
      'Talk Talk',
      talkTalkCatalogue,
    );

    expect(result.essentials.albums).toHaveLength(1);
  });

  it('passes the related albums through untouched, as they are checked separately', () => {
    const related: ConnectedAlbum[] = [
      {
        artist: 'Mark Hollis',
        album: 'Mark Hollis',
        year: '1998',
        connection: 'Singer',
        reason: 'r',
      },
    ];

    const result = verifyEssentials(
      {
        artist: 'Talk Talk',
        albums: [{ album: 'Spirit of Eden', year: '1988', reason: 'One.' }],
        related,
      },
      'Talk Talk',
      talkTalkCatalogue,
    );

    expect(result.essentials.related).toEqual(related);
  });
});

describe('verifyRelated', () => {
  function related(artist: string, album: string): ConnectedAlbum {
    return { artist, album, year: '1998', connection: 'Former member', reason: 'Essential.' };
  }

  it('keeps the albums MusicBrainz knows, with its spelling and year, in order', async () => {
    const result = await verifyRelated(
      [
        related('O.Rang', 'Herd of Instinct'),
        related('beth gibbons & rustin man', 'out of season'),
      ],
      'Talk Talk',
    );

    expect(
      result.related.map((album) => `${album.artist} – ${album.album} (${album.year})`),
    ).toEqual([
      'O.Rang – Herd of Instinct (1994)',
      'Beth Gibbons & Rustin’ Man – Out of Season (2002)',
    ]);
    expect(result.related[0].releaseGroupId).toBe('rg-Herd of Instinct');
    expect(result.related[0].connection).toBe('Former member');
    expect(result.isUnchecked).toBe(false);
  });

  it('drops an album MusicBrainz does not know', async () => {
    const result = await verifyRelated(
      [related('Made Up Band', 'Fake Album'), related('Mark Hollis', 'Mark Hollis')],
      'Talk Talk',
    );

    expect(result.related.map((album) => album.album)).toEqual(['Mark Hollis']);
  });

  it('drops an album by the artist searched for, since this list is for what else to hear', async () => {
    mockFindAlbum.mockResolvedValueOnce({
      status: 'matched',
      match: {
        releaseGroupId: 'rg-own',
        artist: 'Talk Talk',
        album: 'Spirit of Eden',
        year: '1988',
      },
    });

    const result = await verifyRelated([related('Talk Talk', 'Spirit of Eden')], 'Talk Talk');

    expect(result.related).toEqual([]);
  });

  it('drops a repeat of the same album', async () => {
    const result = await verifyRelated(
      [related('Mark Hollis', 'Mark Hollis'), related('Mark Hollis', 'mark hollis')],
      'Talk Talk',
    );

    expect(result.related).toHaveLength(1);
  });

  it('keeps an album it could not look up, unchecked, and says so', async () => {
    mockFindAlbum.mockResolvedValueOnce({ status: 'lookup_failed' });

    const result = await verifyRelated([related('Mark Hollis', 'Mark Hollis')], 'Talk Talk');

    expect(result.related).toHaveLength(1);
    expect(result.related[0].releaseGroupId).toBeUndefined();
    expect(result.isUnchecked).toBe(true);
  });
});

describe('getArtistEssentials', () => {
  it('returns where to start and the related albums that check out', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(startHere));

    const result = await getArtistEssentials({ artist: 'talk talk' });

    expect(result.artist).toBe('Talk Talk');
    expect(result.albums.map((album) => album.album)).toEqual([
      'Spirit of Eden',
      'Laughing Stock',
      'The Colour of Spring',
    ]);
    expect(result.related.map((album) => album.album)).toEqual([
      'Mark Hollis',
      'Herd of Instinct',
      'Out of Season',
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('asks again with the real catalogue when fewer than two start-here albums check out', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeAnswer(['Spirit of Eden', 'Made Up One', 'Made Up Two']))
      .mockResolvedValueOnce(claudeAnswer(['Spirit of Eden', 'Laughing Stock']));

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums).toHaveLength(2);
    const retryPrompt = mockCreate.mock.calls[1][0].messages[0].content as string;
    expect(retryPrompt).toContain('Made Up One, Made Up Two');
    expect(retryPrompt).toContain('Laughing Stock');
    expect(retryPrompt).not.toContain('Natural History');
  });

  it('keeps the first answer if the retry checks out worse', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeAnswer(['Spirit of Eden', 'Made Up One']))
      .mockResolvedValueOnce(claudeAnswer(['Made Up Two']));

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums.map((album) => album.album)).toEqual(['Spirit of Eden']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('fails when none of the albums to start with can be verified', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(['Made Up One']));

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toBeInstanceOf(
      UnverifiedEssentialsError,
    );
  });

  it('fails when the artist is not in MusicBrainz', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(startHere));
    mockFindArtistAlbums.mockResolvedValue({ status: 'not_found' });

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toBeInstanceOf(
      UnverifiedEssentialsError,
    );
  });

  it('retries the lookup with Claude’s spelling of a mistyped artist', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(startHere));
    mockFindArtistAlbums.mockResolvedValueOnce({ status: 'not_found' });

    const result = await getArtistEssentials({ artist: 'Tlak Talk' });

    expect(mockFindArtistAlbums).toHaveBeenLastCalledWith('Talk Talk');
    expect(result.albums.length).toBeGreaterThan(0);
  });

  it('returns the lists unchecked, looking nothing else up, when MusicBrainz is unavailable', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(startHere));
    mockFindArtistAlbums.mockResolvedValue({ status: 'lookup_failed' });

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums).toHaveLength(3);
    expect(result.albums[0].releaseGroupId).toBeUndefined();
    expect(result.related).toHaveLength(4);
    expect(mockFindAlbum).not.toHaveBeenCalled();
  });

  it('still returns where to start when none of the related albums check out', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(startHere, [['Made Up Band', 'Fake Album']]));

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.albums).toHaveLength(3);
    expect(result.related).toEqual([]);
  });
});

describe('getArtistEssentials cache', () => {
  const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
  let store: CacheStore;

  beforeEach(() => {
    store = createInMemoryCacheStore();
    configureLookupCache(store);
    mockCreate.mockResolvedValue(claudeAnswer(startHere));
  });

  afterEach(() => {
    configureLookupCache(null);
  });

  it('answers a repeat request without calling Claude or MusicBrainz', async () => {
    const first = await getArtistEssentials({ artist: 'Talk Talk' });
    mockFindArtistAlbums.mockClear();
    mockFindAlbum.mockClear();

    const second = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(second).toEqual(first);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockFindArtistAlbums).not.toHaveBeenCalled();
    expect(mockFindAlbum).not.toHaveBeenCalled();
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

  it('keeps a verified list for 30 days, under the current version', async () => {
    const set = vi.spyOn(store, 'set');

    await getArtistEssentials({ artist: 'Talk Talk' });

    expect(set).toHaveBeenCalledWith(
      'essentials:v4:talk talk',
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
      listedIds: null,
    });
    const recovered = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(recovered.albums.every((album) => album.releaseGroupId !== undefined)).toBe(true);
  });

  it('does not keep a list with a related album that could not be looked up', async () => {
    mockFindAlbum.mockResolvedValue({ status: 'lookup_failed' });
    await getArtistEssentials({ artist: 'Talk Talk' });

    mockFindAlbum.mockImplementation(async (query) => lookUpRelated(query));
    await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('does not keep a list with no related albums, which may only mean the lookups missed', async () => {
    mockCreate.mockResolvedValue(claudeAnswer(startHere, [['Made Up Band', 'Fake Album']]));
    await getArtistEssentials({ artist: 'Talk Talk' });

    await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
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
      listedIds: null,
    });

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).resolves.toMatchObject({
      artist: 'Talk Talk',
    });
  });

  it('leaves behind a list kept in the old shape, with a discography and no related albums', async () => {
    const first = await getArtistEssentials({ artist: 'Talk Talk' });
    await store.set(
      'essentials:v4:talk talk',
      { artist: first.artist, albums: first.albums, discography: [] },
      60,
    );

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.related.length).toBeGreaterThan(0);
  });

  it('ignores a cached entry that no longer has the right shape and asks again', async () => {
    await getArtistEssentials({ artist: 'Talk Talk' });
    await store.set('essentials:v4:talk talk', { artist: 'Talk Talk', albums: 'nope' }, 60);

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.albums.length).toBeGreaterThan(0);
  });
});
