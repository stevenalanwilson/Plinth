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
import { findAlbum, ReleaseGroupCandidate, selectAlbumMatch } from './albumMatchService';

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
