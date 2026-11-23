import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/musicBrainzClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../repositories/musicBrainzClient')>()),
  musicBrainzFetch: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { musicBrainzFetch, MusicBrainzBusyError } from '../repositories/musicBrainzClient';
import { logger } from '../logger';
import { albumSearchPath, searchAlbums } from './albumSearchService';

const mockFetch = vi.mocked(musicBrainzFetch);

function releaseGroup(
  overrides: Record<string, unknown> = {},
  artist = 'Miles Davis',
): Record<string, unknown> {
  return {
    id: 'rg-1',
    title: 'Kind of Blue',
    score: 100,
    'primary-type': 'Album',
    'first-release-date': '1959-08-17',
    'artist-credit': [{ name: artist }],
    ...overrides,
  };
}

function answer(groups: unknown[]): Response {
  return {
    ok: true,
    json: async (): Promise<unknown> => ({ 'release-groups': groups }),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('albumSearchPath', () => {
  function luceneOf(query: string): string {
    const path = albumSearchPath(query);
    return decodeURIComponent(path.match(/query=([^&]*)/)?.[1] ?? '');
  }

  it('wants every word in the title or the artist, and the last as the start of one', () => {
    expect(luceneOf('miles kind')).toBe(
      '(releasegroup:miles OR artist:miles) AND (releasegroup:kind* OR artist:kind*)' +
        ' AND primarytype:album AND status:official',
    );
  });

  it('leaves out albums that only ever came out as bootlegs or promos', () => {
    expect(luceneOf('can')).toContain('status:official');
  });

  it('lower-cases, so a word such as AND is not read as an operator', () => {
    expect(luceneOf('Guns AND Roses')).toContain('(releasegroup:and OR artist:and)');
  });

  it('escapes characters that mean something in a search', () => {
    expect(luceneOf('a(b')).toContain('releasegroup:a\\(b*');
  });

  it('tidies the spacing between words', () => {
    expect(luceneOf('  miles   davis ')).toBe(luceneOf('miles davis'));
  });

  it('asks for a page of results as JSON', () => {
    expect(albumSearchPath('kind')).toContain('limit=15&fmt=json');
  });
});

describe('searchAlbums', () => {
  it('returns each album with its artist and year', async () => {
    mockFetch.mockResolvedValue(answer([releaseGroup()]));

    expect(await searchAlbums('miles kind')).toEqual({
      status: 'found',
      results: [
        { releaseGroupId: 'rg-1', album: 'Kind of Blue', artist: 'Miles Davis', year: '1959' },
      ],
    });
  });

  it('joins a shared credit the way it is written', async () => {
    mockFetch.mockResolvedValue(
      answer([
        releaseGroup({
          'artist-credit': [{ name: 'Gil Evans', joinphrase: ' & ' }, { name: 'Miles Davis' }],
        }),
      ]),
    );

    const outcome = await searchAlbums('sketches');

    expect(outcome.status === 'found' && outcome.results[0]?.artist).toBe(
      'Gil Evans & Miles Davis',
    );
  });

  it('gives no year when MusicBrainz has no release date', async () => {
    mockFetch.mockResolvedValue(answer([releaseGroup({ 'first-release-date': '' })]));

    const outcome = await searchAlbums('kind');

    expect(outcome.status === 'found' && outcome.results[0]?.year).toBeNull();
  });

  it('keeps MusicBrainz’s order, best match first', async () => {
    mockFetch.mockResolvedValue(
      answer([
        releaseGroup({ id: 'rg-1', title: 'Kind of Blue' }),
        releaseGroup({ id: 'rg-2', title: 'Sketches of Spain' }),
      ]),
    );

    const outcome = await searchAlbums('miles');

    expect(outcome.status === 'found' && outcome.results.map((r) => r.album)).toEqual([
      'Kind of Blue',
      'Sketches of Spain',
    ]);
  });

  it('leaves out anything that is not an album', async () => {
    mockFetch.mockResolvedValue(
      answer([
        releaseGroup({ id: 'rg-1', 'primary-type': 'Single', title: 'So What' }),
        releaseGroup({ id: 'rg-2', 'primary-type': 'Album', title: 'Kind of Blue' }),
      ]),
    );

    const outcome = await searchAlbums('so what');

    expect(outcome.status === 'found' && outcome.results.map((r) => r.releaseGroupId)).toEqual([
      'rg-2',
    ]);
  });

  it('shows an album once when MusicBrainz lists it under two spellings', async () => {
    mockFetch.mockResolvedValue(
      answer([
        releaseGroup({ id: 'rg-1', title: 'Kind of Blue' }),
        releaseGroup({ id: 'rg-2', title: 'Kind of Blue (Legacy Edition)' }),
        releaseGroup({ id: 'rg-3', title: 'Sketches of Spain' }),
      ]),
    );

    const outcome = await searchAlbums('miles');

    expect(outcome.status === 'found' && outcome.results.map((r) => r.releaseGroupId)).toEqual([
      'rg-1',
      'rg-3',
    ]);
  });

  it('keeps two artists’ albums of the same name apart', async () => {
    mockFetch.mockResolvedValue(
      answer([
        releaseGroup({ id: 'rg-1', title: 'Kind of Blue' }, 'Miles Davis'),
        releaseGroup({ id: 'rg-2', title: 'Kind of Blue' }, 'Swiss Blues Authority'),
      ]),
    );

    const outcome = await searchAlbums('kind of blue');

    expect(outcome.status === 'found' && outcome.results).toHaveLength(2);
  });

  it('skips a result that has no title or artist to show', async () => {
    mockFetch.mockResolvedValue(
      answer([
        releaseGroup({ id: 'rg-1', title: '' }),
        releaseGroup({ id: 'rg-2', 'artist-credit': [] }),
        releaseGroup({ id: 'rg-3' }),
      ]),
    );

    const outcome = await searchAlbums('kind');

    expect(outcome.status === 'found' && outcome.results.map((r) => r.releaseGroupId)).toEqual([
      'rg-3',
    ]);
  });

  it('returns at most eight albums', async () => {
    mockFetch.mockResolvedValue(
      answer(Array.from({ length: 12 }, (_, i) => releaseGroup({ id: `rg-${i}`, title: `T${i}` }))),
    );

    const outcome = await searchAlbums('tt');

    expect(outcome.status === 'found' && outcome.results).toHaveLength(8);
  });

  it('is found, with nothing in it, when no album matches', async () => {
    mockFetch.mockResolvedValue(answer([]));

    expect(await searchAlbums('zzzzqqq')).toEqual({ status: 'found', results: [] });
  });

  it.each([[''], [' '], ['a']])('does not search for %j, which is too short', async (query) => {
    expect(await searchAlbums(query)).toEqual({ status: 'found', results: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not search for a query that is too long', async () => {
    expect(await searchAlbums('a'.repeat(81))).toEqual({ status: 'found', results: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('says the search is unavailable, rather than that nothing matched, when MusicBrainz fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

    expect(await searchAlbums('kind')).toEqual({ status: 'unavailable' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('says the search is unavailable when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    expect(await searchAlbums('kind')).toEqual({ status: 'unavailable' });
  });

  it('does not wait in a long line for MusicBrainz, and says so quietly when it is busy', async () => {
    mockFetch.mockRejectedValue(new MusicBrainzBusyError());

    expect(await searchAlbums('kind')).toEqual({ status: 'unavailable' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(AbortSignal),
      expect.objectContaining({ maxQueueMs: expect.any(Number) }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
