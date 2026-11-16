import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRecommendation,
  fetchArtwork,
  fetchArtistRelations,
  fetchArtistEssentials,
  getProxiedArtworkUrl,
} from './apiClient';
import { RecommendationRequest } from '@shared/types';

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

// Path and query only: the base URL comes from VITE_API_URL, which differs between machines.
function requestedUrl(): string {
  const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://base.invalid');
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
