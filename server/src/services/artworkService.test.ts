import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./albumMatchService', () => ({ findAlbum: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchArtwork } from './artworkService';
import { findAlbum } from './albumMatchService';
import { logger } from '../logger';

const mockFindAlbum = vi.mocked(findAlbum);
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const MEZZANINE_MATCH = {
  status: 'matched',
  match: {
    releaseGroupId: 'abc-123',
    artist: 'Massive Attack',
    album: 'Mezzanine',
    year: '1998',
  },
} as const;

const coverArtResponse = {
  ok: true,
  json: async (): Promise<unknown> => ({
    images: [
      {
        front: true,
        image: 'https://coverartarchive.org/image.jpg',
        thumbnails: { '500': 'https://coverartarchive.org/image-500.jpg' },
      },
    ],
  }),
};

function itunesResponse(results: ReadonlyArray<Record<string, string>>): Record<string, unknown> {
  return { ok: true, json: async () => ({ results }) };
}

const appleMusicLink = 'https://music.apple.com/gb/album/mezzanine/123456';

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe('fetchArtwork', () => {
  it('uses Cover Art Archive artwork for a confident match', async () => {
    mockFindAlbum.mockResolvedValue(MEZZANINE_MATCH);
    mockFetch.mockResolvedValueOnce(coverArtResponse).mockResolvedValueOnce({ ok: false });

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(mockFetch.mock.calls[0][0]).toBe('https://coverartarchive.org/release-group/abc-123');
    expect(result).toEqual({
      artworkUrl: 'https://coverartarchive.org/image-500.jpg',
      year: '1998',
      appleMusicUrl: null,
    });
  });

  it('uses a known release group ID without searching MusicBrainz', async () => {
    mockFetch.mockResolvedValueOnce(coverArtResponse).mockResolvedValueOnce({ ok: false });

    const result = await fetchArtwork('Massive Attack', 'Mezzanine', 'known-id');

    expect(mockFindAlbum).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls[0][0]).toBe('https://coverartarchive.org/release-group/known-id');
    expect(result.artworkUrl).toBe('https://coverartarchive.org/image-500.jpg');
  });

  it('skips Cover Art Archive when there is no confident match', async () => {
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });
    mockFetch.mockResolvedValueOnce(itunesResponse([]));

    const result = await fetchArtwork('Unknown Artist', 'Unknown Album');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('itunes.apple.com');
    expect(result).toEqual({ artworkUrl: null, year: null, appleMusicUrl: null });
  });

  it('falls back to iTunes artwork when Cover Art Archive has none', async () => {
    mockFindAlbum.mockResolvedValue(MEZZANINE_MATCH);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ images: [] }) })
      .mockResolvedValueOnce(
        itunesResponse([
          {
            collectionName: 'Mezzanine (Remastered)',
            artistName: 'Massive Attack',
            collectionViewUrl: appleMusicLink,
            artworkUrl100: 'https://is1.mzstatic.com/image/100x100bb.jpg',
          },
        ]),
      );

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result).toEqual({
      artworkUrl: 'https://is1.mzstatic.com/image/500x500bb.jpg',
      year: '1998',
      appleMusicUrl: appleMusicLink,
    });
  });

  it('still uses an exact iTunes match when MusicBrainz is unavailable', async () => {
    mockFindAlbum.mockResolvedValue({ status: 'lookup_failed' });
    mockFetch.mockResolvedValueOnce(
      itunesResponse([
        {
          collectionName: 'Mezzanine',
          artistName: 'Massive Attack',
          collectionViewUrl: appleMusicLink,
          artworkUrl100: 'https://is1.mzstatic.com/image/100x100bb.jpg',
        },
      ]),
    );

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result.artworkUrl).toBe('https://is1.mzstatic.com/image/500x500bb.jpg');
    expect(result.year).toBeNull();
  });

  it('ignores iTunes results that are not the requested album', async () => {
    mockFindAlbum.mockResolvedValue({ status: 'lookup_failed' });
    mockFetch.mockResolvedValueOnce(
      itunesResponse([
        {
          collectionName: 'Jeopardy! (Cover Version) - Single',
          artistName: 'Geek Music',
          collectionViewUrl: 'https://music.apple.com/gb/album/jeopardy/1',
          artworkUrl100: 'https://is1.mzstatic.com/tv-theme/100x100bb.jpg',
        },
      ]),
    );

    const result = await fetchArtwork('The Sound', 'Jeopardy');

    expect(result).toEqual({ artworkUrl: null, year: null, appleMusicUrl: null });
  });

  it('returns the Apple Music link even when Cover Art Archive has artwork', async () => {
    mockFindAlbum.mockResolvedValue(MEZZANINE_MATCH);
    mockFetch.mockResolvedValueOnce(coverArtResponse).mockResolvedValueOnce(
      itunesResponse([
        {
          collectionName: 'Mezzanine',
          artistName: 'Massive Attack',
          collectionViewUrl: appleMusicLink,
        },
      ]),
    );

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result.artworkUrl).toBe('https://coverartarchive.org/image-500.jpg');
    expect(result.appleMusicUrl).toBe(appleMusicLink);
  });

  it('survives Cover Art Archive and iTunes both failing', async () => {
    mockFindAlbum.mockResolvedValue(MEZZANINE_MATCH);
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result).toEqual({ artworkUrl: null, year: '1998', appleMusicUrl: null });
  });

  it('logs where the artwork came from', async () => {
    mockFindAlbum.mockResolvedValue(MEZZANINE_MATCH);
    mockFetch.mockResolvedValueOnce(coverArtResponse).mockResolvedValueOnce({ ok: false });

    await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cover-art-archive', releaseGroupId: 'abc-123' }),
      'artwork source',
    );
  });
});
