import {
  AlbumDetailsResponse,
  AlbumResponse,
  RecommendationRequest,
  RecommendationResponse,
  ArtworkResponse,
  ArtistRelationsResponse,
  ArtistEssentialsResponse,
} from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const API_V1 = '/api/v1';

/** A failed API call, with the HTTP status so callers can tell "not found" from "try later". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return new ApiError(data.error ?? `Request failed with status ${res.status}`, res.status);
}
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  // Combined by hand: AbortSignal.any needs Safari 17.4 and AbortSignal.timeout Safari 16.4,
  // and a shared album link may well be opened on an older iPhone.
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  const timeoutId = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  if (externalSignal?.aborted) cancel();
  else externalSignal?.addEventListener('abort', cancel, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) throw err; // propagate cancellation as-is
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    signal,
  );

  if (!res.ok) throw await toApiError(res);

  return res.json() as Promise<T>;
}

async function get<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(
    `${API_BASE}${path}${query ? `?${query}` : ''}`,
    undefined,
    signal,
  );

  if (!res.ok) throw await toApiError(res);

  return res.json() as Promise<T>;
}

export function fetchRecommendation(
  request: RecommendationRequest,
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  return post<RecommendationResponse>(`${API_V1}/recommend`, request, signal);
}

export function fetchArtwork(
  artist: string,
  album: string,
  releaseGroupId?: string,
): Promise<ArtworkResponse> {
  return get<ArtworkResponse>(`${API_V1}/artwork`, {
    artist,
    album,
    ...(releaseGroupId ? { releaseGroupId } : {}),
  });
}

export function fetchAlbum(slug: string, signal?: AbortSignal): Promise<AlbumResponse> {
  return get<AlbumResponse>(`${API_V1}/albums/${encodeURIComponent(slug)}`, {}, signal);
}

/** A real album to show first-time visitors. Rejects with a 404 ApiError until one exists. */
export function fetchExampleAlbum(signal?: AbortSignal): Promise<AlbumResponse> {
  return get<AlbumResponse>(`${API_V1}/example-album`, {}, signal);
}

export function fetchAlbumDetails(
  slug: string,
  signal?: AbortSignal,
): Promise<AlbumDetailsResponse> {
  return get<AlbumDetailsResponse>(
    `${API_V1}/albums/${encodeURIComponent(slug)}/details`,
    {},
    signal,
  );
}

/**
 * Artwork for a pick: from its stored album when it has a slug, otherwise looked up by name
 * (and release group, when the pick was matched).
 */
export async function fetchRecommendationArtwork(
  recommendation: RecommendationResponse,
): Promise<ArtworkResponse> {
  const { artist, album, releaseGroupId, slug } = recommendation;
  if (slug) {
    try {
      const stored = await fetchAlbum(slug);
      return {
        artworkUrl: stored.artworkUrl,
        year: stored.year,
        appleMusicUrl: stored.appleMusicUrl,
      };
    } catch (error) {
      // A slug only disappears where albums live in memory (local dev without a database), so
      // fall back for that, but not for errors like rate limits that a retry would only repeat.
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  return fetchArtwork(artist, album, releaseGroupId);
}

export function fetchArtistRelations(artist: string): Promise<ArtistRelationsResponse> {
  return get<ArtistRelationsResponse>(`${API_V1}/artist-rels`, { artist });
}

export function fetchArtistEssentials(
  artist: string,
  signal?: AbortSignal,
): Promise<ArtistEssentialsResponse> {
  return post<ArtistEssentialsResponse>(`${API_V1}/artist-essentials`, { artist }, signal);
}

export function getProxiedArtworkUrl(artworkUrl: string): string {
  return `${API_BASE}${API_V1}/image?url=${encodeURIComponent(artworkUrl)}`;
}

export function buildAppleMusicSearchUrl(artist: string, album: string): string {
  return `https://music.apple.com/gb/search?term=${encodeURIComponent(`${artist} ${album}`)}`;
}

export function buildSpotifySearchUrl(artist: string, album: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${album}`)}`;
}

export function buildDiscogsSearchUrl(artist: string, album: string): string {
  return `https://www.discogs.com/search/?q=${encodeURIComponent(`${artist} ${album}`)}&type=release`;
}
