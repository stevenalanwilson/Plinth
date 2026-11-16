import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  fetchAlbum,
  fetchRecommendation,
  fetchRecommendationArtwork,
  fetchArtwork,
  fetchArtistRelations,
  fetchArtistEssentials,
  getProxiedArtworkUrl,
} from './apiClient';
import { AlbumResponse, RecommendationRequest, RecommendationResponse } from '@shared/types';

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

// Path and query only: the base URL comes from VITE_API_URL, which differs between machines.
function requestedUrl(call = 0): string {
  const url = new URL(String(fetchMock.mock.calls[call][0]), 'http://base.invalid');
  return `${url.pathname}${url.search}`;
}

function pathAndQuery(url: string): string {
  const parsed = new URL(url, 'http://base.invalid');
  return `${parsed.pathname}${parsed.search}`;
}

beforeEach(() => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('apiClient paths', () => {
  it('posts recommendations to the v1 API', async () => {
    await fetchRecommendation({} as RecommendationRequest);

    expect(requestedUrl()).toBe('/api/v1/recommend');
  });

  it('fetches artwork from the v1 API', async () => {
    await fetchArtwork('The Sound', 'Jeopardy', 'abc');

    expect(requestedUrl()).toBe(
      '/api/v1/artwork?artist=The+Sound&album=Jeopardy&releaseGroupId=abc',
    );
  });

  it('fetches connected artists from the v1 API', async () => {
    await fetchArtistRelations('Can');

    expect(requestedUrl()).toBe('/api/v1/artist-rels?artist=Can');
  });

  it('posts Artist Essentials requests to the v1 API', async () => {
    await fetchArtistEssentials('Can');

    expect(requestedUrl()).toBe('/api/v1/artist-essentials');
  });

  it('proxies artwork through the v1 image endpoint', () => {
    expect(pathAndQuery(getProxiedArtworkUrl('https://coverartarchive.org/x.jpg'))).toBe(
      '/api/v1/image?url=https%3A%2F%2Fcoverartarchive.org%2Fx.jpg',
    );
  });
});

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'A hook.',
  genres: [],
  country: null,
  artworkUrl: 'https://coverartarchive.org/x.jpg',
  appleMusicUrl: 'https://music.apple.com/x',
};

const PICK: RecommendationResponse = {
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  reason: 'Because.',
  releaseGroupId: 'rg-1',
  slug: 'the-sound-jeopardy',
};

function respondWith(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe('fetchAlbum', () => {
  it('fetches the album by slug from the v1 API, with no empty query string', async () => {
    respondWith(200, ALBUM);

    expect(await fetchAlbum('the-sound-jeopardy')).toEqual(ALBUM);
    expect(requestedUrl()).toBe('/api/v1/albums/the-sound-jeopardy');
  });

  it('encodes slugs in other scripts', async () => {
    respondWith(200, ALBUM);

    await fetchAlbum('大瀧詠一-a-long-vacation');

    expect(requestedUrl()).toBe(`/api/v1/albums/${encodeURIComponent('大瀧詠一-a-long-vacation')}`);
  });

  it('throws an ApiError carrying the status and the server message', async () => {
    respondWith(404, { error: 'Album not found' });

    const error = await fetchAlbum('nope').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'Album not found' });
  });
});

describe('fetchRecommendationArtwork', () => {
  it('uses the album endpoint when the pick has a slug', async () => {
    respondWith(200, ALBUM);

    expect(await fetchRecommendationArtwork(PICK)).toEqual({
      artworkUrl: ALBUM.artworkUrl,
      year: '1980',
      appleMusicUrl: ALBUM.appleMusicUrl,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl()).toBe('/api/v1/albums/the-sound-jeopardy');
  });

  it('falls back to the artwork endpoint when the slug is not found', async () => {
    respondWith(404, { error: 'Album not found' });
    respondWith(200, { artworkUrl: 'https://x/y.jpg', year: null, appleMusicUrl: null });

    expect((await fetchRecommendationArtwork(PICK)).artworkUrl).toBe('https://x/y.jpg');
    expect(requestedUrl(1)).toBe(
      '/api/v1/artwork?artist=The+Sound&album=Jeopardy&releaseGroupId=rg-1',
    );
  });

  it('does not fall back on other errors, so a rate limit is not doubled', async () => {
    respondWith(429, { error: 'Too many requests' });

    await expect(fetchRecommendationArtwork(PICK)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the artwork endpoint for picks without a slug', async () => {
    respondWith(200, { artworkUrl: null, year: null, appleMusicUrl: null });
    await fetchRecommendationArtwork({ ...PICK, slug: undefined });

    expect(requestedUrl()).toBe(
      '/api/v1/artwork?artist=The+Sound&album=Jeopardy&releaseGroupId=rg-1',
    );
  });
});
