import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  fetchAlbum,
  fetchAlbumDetails,
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

describe('request timeout and cancellation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Behaves like fetch: rejects with an AbortError when the request's signal is aborted.
  function hangUntilAborted(): void {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const abort = (): void => reject(new DOMException('Aborted', 'AbortError'));
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort);
        }),
    );
  }

  it('works without AbortSignal.any and AbortSignal.timeout, which older Safari lacks', async () => {
    vi.stubGlobal('AbortSignal', class extends EventTarget {});
    respondWith(200, ALBUM);

    await expect(fetchAlbum('the-sound-jeopardy', new AbortController().signal)).resolves.toEqual(
      ALBUM,
    );
  });

  it('turns a timeout into a friendly message', async () => {
    vi.useFakeTimers();
    hangUntilAborted();

    const result = fetchArtistRelations('Can').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await result).toMatchObject({ message: 'Request timed out. Please try again.' });
  });

  it('passes the caller cancelling through untouched', async () => {
    hangUntilAborted();
    const controller = new AbortController();

    const result = fetchAlbum('the-sound-jeopardy', controller.signal).catch(
      (error: unknown) => error,
    );
    controller.abort();

    expect(await result).toMatchObject({ name: 'AbortError' });
  });

  it('rejects at once when the caller had already cancelled', async () => {
    hangUntilAborted();
    const controller = new AbortController();
    controller.abort();

    await expect(fetchAlbum('the-sound-jeopardy', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('leaves no timer running once the response arrives', async () => {
    vi.useFakeTimers();
    respondWith(200, ALBUM);

    await fetchAlbum('the-sound-jeopardy');

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fetchAlbumDetails', () => {
  const DETAILS = {
    release: { date: '1980-11', country: 'GB', label: 'Korova', catalogueNumber: 'KODE 2' },
    formats: ['12" Vinyl'],
    discs: [],
    moreFromArtist: null,
  };

  it('fetches the details from the v1 API, with no empty query string', async () => {
    respondWith(200, DETAILS);

    expect(await fetchAlbumDetails('the-sound-jeopardy')).toEqual(DETAILS);
    expect(requestedUrl()).toBe('/api/v1/albums/the-sound-jeopardy/details');
  });

  it('encodes slugs in other scripts', async () => {
    respondWith(200, DETAILS);

    await fetchAlbumDetails('大瀧詠一-a-long-vacation');

    expect(requestedUrl()).toBe(
      `/api/v1/albums/${encodeURIComponent('大瀧詠一-a-long-vacation')}/details`,
    );
  });

  it('throws an ApiError with the server message and status', async () => {
    respondWith(502, { error: "Couldn't load the album details. Please try again." });

    await expect(fetchAlbumDetails('the-sound-jeopardy')).rejects.toMatchObject({
      status: 502,
      message: "Couldn't load the album details. Please try again.",
    });
  });
});
