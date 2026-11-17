import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./albumMatchService', () => ({ findAlbum: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchArtwork } from './artworkService';
import { findAlbum } from './albumMatchService';
import { logger } from '../logger';
import { createInMemoryCacheStore } from '../repositories/inMemoryCacheStore';
import { configureLookupCache } from '../repositories/lookupCache';

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

describe('fetchArtwork iTunes cache', () => {
  const ITUNES_ALBUM = {
    collectionName: 'Mezzanine',
    artistName: 'Massive Attack',
    collectionViewUrl: 'https://music.apple.com/gb/album/mezzanine/123456',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/100x100bb.jpg',
  };

  function itunesCalls(): number {
    return mockFetch.mock.calls.filter(([url]) => String(url).includes('itunes.apple.com')).length;
  }

  // Cover Art Archive has nothing; iTunes answers with the given response each time it is asked.
  function serve(itunes: () => Response): void {
    mockFetch.mockImplementation(async (url: string) =>
      url.includes('itunes.apple.com') ? itunes() : new Response('{}', { status: 404 }),
    );
  }

  beforeEach(() => {
    configureLookupCache(createInMemoryCacheStore());
  });

  afterEach(() => {
    configureLookupCache(null);
  });

  it('asks iTunes once for an album and serves repeat lookups from the cache', async () => {
    serve(() => new Response(JSON.stringify({ results: [ITUNES_ALBUM] }), { status: 200 }));

    const first = await fetchArtwork('Massive Attack', 'Mezzanine', 'known-id');
    const second = await fetchArtwork('Massive Attack', 'Mezzanine', 'known-id');

    expect(itunesCalls()).toBe(1);
    expect(second).toEqual(first);
    expect(second.appleMusicUrl).toBe(ITUNES_ALBUM.collectionViewUrl);
  });

  it('asks again for a different album', async () => {
    serve(() => new Response(JSON.stringify({ results: [ITUNES_ALBUM] }), { status: 200 }));

    await fetchArtwork('Massive Attack', 'Mezzanine', 'known-id');
    await fetchArtwork('Massive Attack', 'Protection', 'other-id');

    expect(itunesCalls()).toBe(2);
  });

  it('does not keep an iTunes failure, so the next lookup tries again', async () => {
    let healthy = false;
    serve(() =>
      healthy
        ? new Response(JSON.stringify({ results: [ITUNES_ALBUM] }), { status: 200 })
        : new Response('busy', { status: 503 }),
    );

    const failed = await fetchArtwork('Massive Attack', 'Mezzanine', 'known-id');
    healthy = true;
    const recovered = await fetchArtwork('Massive Attack', 'Mezzanine', 'known-id');

    expect(failed.appleMusicUrl).toBeNull();
    expect(recovered.appleMusicUrl).toBe(ITUNES_ALBUM.collectionViewUrl);
    expect(itunesCalls()).toBe(2);
  });

  it('keeps an iTunes search that found nothing, since the album is not there', async () => {
    serve(() => new Response(JSON.stringify({ results: [] }), { status: 200 }));

    await fetchArtwork('Obscure Band', 'Demo Tape', 'known-id');
    await fetchArtwork('Obscure Band', 'Demo Tape', 'known-id');

    expect(itunesCalls()).toBe(1);
  });
});
