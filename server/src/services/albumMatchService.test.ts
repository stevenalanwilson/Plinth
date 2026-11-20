import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/musicBrainzClient', () => ({
  escapeLucene: (value: string): string => value,
  musicBrainzFetch: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { musicBrainzFetch } from '../repositories/musicBrainzClient';
import { logger } from '../logger';
import {
  findAlbum,
  findArtistAlbums,
  findArtistAlbumsById,
  ReleaseGroupCandidate,
  selectAlbumMatch,
} from './albumMatchService';

const mockMusicBrainzFetch = vi.mocked(musicBrainzFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const jeopardy: ReleaseGroupCandidate = {
  id: 'jeopardy-1980',
  title: 'Jeopardy',
  score: 100,
  'primary-type': 'Album',
  'first-release-date': '1980-11',
  'artist-credit': [{ name: 'The Sound' }],
};

const jeopardyCompilation: ReleaseGroupCandidate = {
  id: 'jeopardy-plus',
  title: 'Jeopardy / From the Lion’s Mouth / All Fall Down... Plus',
  score: 64,
  'primary-type': 'Album',
  'secondary-types': ['Compilation'],
  'first-release-date': '2014-04-28',
  'artist-credit': [{ name: 'The Sound' }],
};

function searchResponse(candidates: readonly ReleaseGroupCandidate[]): Response {
  return { ok: true, json: async () => ({ 'release-groups': candidates }) } as Response;
}

describe('selectAlbumMatch', () => {
  const query = { artist: 'The Sound', album: 'Jeopardy', year: '1980' };

  it('matches the album with the same title and artist', () => {
    expect(selectAlbumMatch([jeopardyCompilation, jeopardy], query)).toEqual({
      releaseGroupId: 'jeopardy-1980',
      artist: 'The Sound',
      album: 'Jeopardy',
      year: '1980',
    });
  });

  it('rejects a title that only contains the requested one', () => {
    expect(selectAlbumMatch([jeopardyCompilation], query)).toBeNull();
  });

  it('rejects the right title by a different artist', () => {
    const tvTheme = { ...jeopardy, 'artist-credit': [{ name: 'Television’s Greatest Hits Band' }] };
    expect(selectAlbumMatch([tvTheme], query)).toBeNull();
  });

  it('rejects release groups that are not albums', () => {
    expect(selectAlbumMatch([{ ...jeopardy, 'primary-type': 'Single' }], query)).toBeNull();
  });

  it('prefers the release closest to the requested year', () => {
    const reissue = { ...jeopardy, id: 'jeopardy-2000', 'first-release-date': '2000', score: 100 };
    const original = { ...jeopardy, id: 'jeopardy-1980', score: 90 };
    expect(selectAlbumMatch([reissue, original], query)?.releaseGroupId).toBe('jeopardy-1980');
  });

  it('prefers a studio album over a live album of the same name', () => {
    const live = { ...jeopardy, id: 'jeopardy-live', 'secondary-types': ['Live'] };
    expect(selectAlbumMatch([live, jeopardy], query)?.releaseGroupId).toBe('jeopardy-1980');
  });

  it('matches against the full credit of a collaboration', () => {
    const collaboration: ReleaseGroupCandidate = {
      ...jeopardy,
      title: 'My Life in the Bush of Ghosts',
      'artist-credit': [{ name: 'Brian Eno', joinphrase: ' & ' }, { name: 'David Byrne' }],
    };
    const match = selectAlbumMatch([collaboration], {
      artist: 'Brian Eno and David Byrne',
      album: 'My Life in the Bush of Ghosts',
    });
    expect(match?.artist).toBe('Brian Eno & David Byrne');
  });

  it('shows the requested artist rather than a long classical credit', () => {
    const tabulaRasa: ReleaseGroupCandidate = {
      ...jeopardy,
      title: 'Tabula Rasa',
      'artist-credit': [
        { name: 'Arvo Pärt', joinphrase: '; ' },
        { name: 'Gidon Kremer', joinphrase: ', ' },
        { name: 'Keith Jarrett' },
      ],
    };
    const match = selectAlbumMatch([tabulaRasa], { artist: 'Arvo Pärt', album: 'Tabula Rasa' });
    expect(match?.artist).toBe('Arvo Pärt');
  });

  it('matches a title that leads with the artist name', () => {
    const basinStreet: ReleaseGroupCandidate = {
      ...jeopardy,
      title: 'Clifford Brown and Max Roach at Basin Street',
      'artist-credit': [{ name: 'Clifford Brown', joinphrase: ' & ' }, { name: 'Max Roach' }],
    };
    const match = selectAlbumMatch([basinStreet], {
      artist: 'Clifford Brown & Max Roach',
      album: 'At Basin Street',
    });
    expect(match?.album).toBe('Clifford Brown and Max Roach at Basin Street');
  });
});

describe('findAlbum', () => {
  const query = { artist: 'The Sound', album: 'Jeopardy', year: '1980' };

  it('searches MusicBrainz for albums by title and artist', async () => {
    mockMusicBrainzFetch.mockResolvedValue(searchResponse([jeopardy]));

    await findAlbum(query);

    const path = decodeURIComponent(mockMusicBrainzFetch.mock.calls[0][0]);
    expect(path).toContain('releasegroup:(jeopardy)');
    expect(path).toContain('artist:(the sound)');
    expect(path).toContain('primarytype:album');
  });

  it('reports a confident match and logs it', async () => {
    mockMusicBrainzFetch.mockResolvedValue(searchResponse([jeopardy]));

    const lookup = await findAlbum(query);

    expect(lookup).toEqual({
      status: 'matched',
      match: expect.objectContaining({ releaseGroupId: 'jeopardy-1980' }),
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'matched', releaseGroupId: 'jeopardy-1980' }),
      'album match',
    );
  });

  it('reports not_found and logs the closest candidate', async () => {
    mockMusicBrainzFetch.mockResolvedValue(searchResponse([jeopardyCompilation]));

    const lookup = await findAlbum(query);

    expect(lookup).toEqual({ status: 'not_found' });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'not_found',
        closest: 'The Sound – Jeopardy / From the Lion’s Mouth / All Fall Down... Plus',
      }),
      'album match',
    );
  });

  it('reports lookup_failed when MusicBrainz returns an error', async () => {
    mockMusicBrainzFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(findAlbum(query)).resolves.toEqual({ status: 'lookup_failed' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'lookup_failed', status: 503 }),
      'album match',
    );
  });

  it('reports lookup_failed when the request throws', async () => {
    mockMusicBrainzFetch.mockRejectedValue(new Error('timed out'));

    await expect(findAlbum(query)).resolves.toEqual({ status: 'lookup_failed' });
  });
});

describe('findArtistAlbums', () => {
  function jsonResponse(body: unknown): Response {
    return { ok: true, json: async (): Promise<unknown> => body } as Response;
  }

  it('finds the artist and fetches their albums, and which of them their page lists', async () => {
    const bootleg = { ...jeopardy, id: 'live-bootleg', title: 'Live at the Marquee' };
    mockMusicBrainzFetch
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'artist-1', name: 'The Sound' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ 'release-group-count': 2, 'release-groups': [jeopardy, bootleg] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ 'release-group-count': 1, 'release-groups': [jeopardy] }),
      );

    const lookup = await findArtistAlbums('the sound');

    expect(lookup).toEqual({
      status: 'found',
      artist: 'The Sound',
      albums: [jeopardy, bootleg],
      listedIds: new Set(['jeopardy-1980']),
    });
    const [, all, listed] = mockMusicBrainzFetch.mock.calls.map(([path]) => path);
    expect(all).toContain('release-group?artist=artist-1&type=album&inc');
    expect(listed).toContain(
      'release-group?artist=artist-1&type=album&release-group-status=website-default',
    );
  });

  it('still finds the albums when the listed ones can’t be fetched', async () => {
    mockMusicBrainzFetch
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'artist-1', name: 'The Sound' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ 'release-group-count': 1, 'release-groups': [jeopardy] }),
      )
      .mockRejectedValueOnce(new Error('timed out'));

    const lookup = await findArtistAlbums('The Sound');

    expect(lookup).toEqual({
      status: 'found',
      artist: 'The Sound',
      albums: [jeopardy],
      listedIds: null,
    });
  });

  it('pages through a large catalogue', async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ ...jeopardy, id: `rg-${index}` }));
    mockMusicBrainzFetch
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'artist-1', name: 'The Sound' }] }))
      .mockResolvedValueOnce(jsonResponse({ 'release-group-count': 150, 'release-groups': page }))
      .mockResolvedValueOnce(
        jsonResponse({ 'release-group-count': 150, 'release-groups': page.slice(0, 50) }),
      );

    const lookup = await findArtistAlbums('The Sound');

    expect(lookup.status === 'found' && lookup.albums).toHaveLength(150);
    expect(mockMusicBrainzFetch.mock.calls[2][0]).toContain('offset=100');
  });

  it('reports not_found when no artist has a matching name', async () => {
    mockMusicBrainzFetch.mockResolvedValueOnce(
      jsonResponse({ artists: [{ id: 'artist-2', name: 'Soundgarden' }] }),
    );

    await expect(findArtistAlbums('The Sound')).resolves.toEqual({ status: 'not_found' });
  });

  it('reports lookup_failed when MusicBrainz errors', async () => {
    mockMusicBrainzFetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    await expect(findArtistAlbums('The Sound')).resolves.toEqual({ status: 'lookup_failed' });
  });
});

describe('findArtistAlbumsById', () => {
  function jsonResponse(body: unknown): Response {
    return { ok: true, json: async (): Promise<unknown> => body } as Response;
  }

  it('fetches the albums of the chosen artist without searching for their name first', async () => {
    mockMusicBrainzFetch
      .mockResolvedValueOnce(
        jsonResponse({ 'release-group-count': 1, 'release-groups': [jeopardy] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ 'release-group-count': 1, 'release-groups': [jeopardy] }),
      );

    const lookup = await findArtistAlbumsById('artist-uk', 'Nirvana');

    expect(lookup).toEqual({
      status: 'found',
      artist: 'Nirvana',
      albums: [jeopardy],
      listedIds: new Set(['jeopardy-1980']),
    });
    const paths = mockMusicBrainzFetch.mock.calls.map(([path]) => path);
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path.startsWith('release-group?artist=artist-uk'))).toBe(true);
  });

  it('reports lookup_failed when MusicBrainz errors', async () => {
    mockMusicBrainzFetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    await expect(findArtistAlbumsById('artist-uk', 'Nirvana')).resolves.toEqual({
      status: 'lookup_failed',
    });
  });

  it('reports lookup_failed when the request throws', async () => {
    mockMusicBrainzFetch.mockRejectedValueOnce(new Error('timed out'));

    await expect(findArtistAlbumsById('artist-uk', 'Nirvana')).resolves.toEqual({
      status: 'lookup_failed',
    });
  });
});
