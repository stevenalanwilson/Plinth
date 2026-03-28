import { RecommendationRequest, RecommendationResponse, ArtworkResponse } from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signals = externalSignal ? [timeoutSignal, externalSignal] : [timeoutSignal];
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) throw err; // propagate cancellation as-is
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
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
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  return post<RecommendationResponse>('/api/recommend', request, signal);
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
