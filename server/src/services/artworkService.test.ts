import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchArtwork, _resetSpotifyTokenForTesting } from './artworkService';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  // resetAllMocks clears the mockResolvedValueOnce queue, preventing leftover mocks
  // from one test contaminating the next.
  vi.resetAllMocks();
  _resetSpotifyTokenForTesting();
  // Ensure Spotify credentials are always present so the full fetch flow is exercised.
  process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';
});

// Helpers for common Spotify mock responses
function mockSpotifyTokenOk(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
  });
}

function mockSpotifySearchOk(spotifyUrl: string, albumName: string, artistName: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      albums: {
        items: [
          {
            name: albumName,
            artists: [{ name: artistName }],
            external_urls: { spotify: spotifyUrl },
          },
        ],
      },
    }),
  });
}

function mockSpotifyFail(): void {
  mockFetch.mockResolvedValueOnce({ ok: false });
  mockFetch.mockResolvedValueOnce({ ok: false });
}

describe('fetchArtwork', () => {
  it('returns artworkUrl and year on successful lookup', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'abc-123',
              title: 'Mezzanine',
              'first-release-date': '1998-04-20',
              'artist-credit': [{ name: 'Massive Attack' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: [
            {
              front: true,
              image: 'https://coverartarchive.org/image.jpg',
              thumbnails: { '500': 'https://coverartarchive.org/image-500.jpg' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false }); // iTunes

    mockSpotifyTokenOk();
    mockSpotifySearchOk('https://open.spotify.com/album/abc', 'Mezzanine', 'Massive Attack');

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result.year).toBe('1998');
    expect(result.artworkUrl).toBe('https://coverartarchive.org/image-500.jpg');
    expect(result.appleMusicUrl).toBeNull();
    expect(result.spotifyUrl).toBe('https://open.spotify.com/album/abc');
  });

  it('returns null values when MusicBrainz returns no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 'release-groups': [] }),
    });

    mockSpotifyFail();

    const result = await fetchArtwork('Unknown Artist', 'Unknown Album');

    expect(result.artworkUrl).toBeNull();
    expect(result.year).toBeNull();
    expect(result.appleMusicUrl).toBeNull();
    expect(result.spotifyUrl).toBeNull();
  });

  it('returns null values when MusicBrainz request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 }); // MusicBrainz
    mockFetch.mockResolvedValueOnce({ ok: false }); // iTunes fallback

    mockSpotifyFail();

    const result = await fetchArtwork('Artist', 'Album');

    expect(result.artworkUrl).toBeNull();
    expect(result.year).toBeNull();
    expect(result.appleMusicUrl).toBeNull();
    expect(result.spotifyUrl).toBeNull();
  });

  it('returns year but null artwork when Cover Art Archive has no images', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'xyz-456',
              title: 'Some Album',
              'first-release-date': '2005-01-01',
              'artist-credit': [{ name: 'Some Artist' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] }),
      })
      .mockResolvedValueOnce({ ok: false }); // iTunes

    mockSpotifyFail();

    const result = await fetchArtwork('Some Artist', 'Some Album');

    expect(result.year).toBe('2005');
    expect(result.artworkUrl).toBeNull();
    expect(result.spotifyUrl).toBeNull();
  });

  it('prioritises exact title match over partial match', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'partial-1',
              title: 'Blue Lines Deluxe',
              'first-release-date': '2012-01-01',
              'artist-credit': [{ name: 'Massive Attack' }],
            },
            {
              id: 'exact-2',
              title: 'Blue Lines',
              'first-release-date': '1991-04-08',
              'artist-credit': [{ name: 'Massive Attack' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false }); // iTunes

    mockSpotifyFail();

    const result = await fetchArtwork('Massive Attack', 'Blue Lines');

    // Should pick the exact match (id: exact-2, year 1991)
    expect(result.year).toBe('1991');
  });

  it('returns appleMusicUrl when iTunes lookup succeeds', async () => {
    const appleMusicLink = 'https://music.apple.com/gb/album/mezzanine/123456';
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'abc-123',
              title: 'Mezzanine',
              'first-release-date': '1998-04-20',
              'artist-credit': [{ name: 'Massive Attack' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              collectionName: 'Mezzanine',
              artistName: 'Massive Attack',
              collectionViewUrl: appleMusicLink,
            },
          ],
        }),
      });

    mockSpotifyFail();

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result.appleMusicUrl).toBe(appleMusicLink);
    expect(result.spotifyUrl).toBeNull();
  });

  it('returns null appleMusicUrl when iTunes lookup fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'abc-123',
              title: 'Mezzanine',
              'first-release-date': '1998-04-20',
              'artist-credit': [{ name: 'Massive Attack' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false, status: 503 }); // iTunes

    mockSpotifyTokenOk();
    mockSpotifySearchOk('https://open.spotify.com/album/xyz', 'Mezzanine', 'Massive Attack');

    const result = await fetchArtwork('Massive Attack', 'Mezzanine');

    expect(result.appleMusicUrl).toBeNull();
    expect(result.year).toBe('1998');
    expect(result.spotifyUrl).toBe('https://open.spotify.com/album/xyz');
  });

  it('returns spotifyUrl when Spotify lookup succeeds', async () => {
    const spotifyLink = 'https://open.spotify.com/album/abc123';
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'abc-123',
              title: 'Untrue',
              'first-release-date': '2007-11-05',
              'artist-credit': [{ name: 'Burial' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false }) // CAA
      .mockResolvedValueOnce({ ok: false }); // iTunes

    mockSpotifyTokenOk();
    mockSpotifySearchOk(spotifyLink, 'Untrue', 'Burial');

    const result = await fetchArtwork('Burial', 'Untrue');

    expect(result.spotifyUrl).toBe(spotifyLink);
    expect(result.year).toBe('2007');
  });

  it('returns null spotifyUrl when Spotify credentials are missing', async () => {
    const originalClientId = process.env.SPOTIFY_CLIENT_ID;
    const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;

    try {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            'release-groups': [
              {
                id: 'abc-123',
                title: 'Untrue',
                'first-release-date': '2007-11-05',
                'artist-credit': [{ name: 'Burial' }],
              },
            ],
          }),
        })
        .mockResolvedValueOnce({ ok: false }) // CAA
        .mockResolvedValueOnce({ ok: false }); // iTunes

      const result = await fetchArtwork('Burial', 'Untrue');
      expect(result.spotifyUrl).toBeNull();
    } finally {
      process.env.SPOTIFY_CLIENT_ID = originalClientId;
      process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
    }
  });
});
