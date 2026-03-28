import { RecommendationRequest, RecommendationResponse, ArtworkResponse } from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${API_BASE}${path}?${query}`);

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function fetchRecommendation(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  return post<RecommendationResponse>('/api/recommend', request);
}

export function fetchArtwork(artist: string, album: string): Promise<ArtworkResponse> {
  return get<ArtworkResponse>('/api/artwork', { artist, album });
}

export function getProxiedArtworkUrl(artworkUrl: string): string {
  return `${API_BASE}/api/image?url=${encodeURIComponent(artworkUrl)}`;
}

export function buildAppleMusicSearchUrl(artist: string, album: string): string {
  return `https://music.apple.com/gb/search?term=${encodeURIComponent(`${artist} ${album}`)}`;
}

export function buildSpotifySearchUrl(artist: string, album: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${album}`)}`;
}
