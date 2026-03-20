import { RecommendationRequest, RecommendationResponse, ArtworkResponse } from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
  const res = await fetch(`${API_BASE}${path}?${query}`);

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function fetchRecommendation(request: RecommendationRequest): Promise<RecommendationResponse> {
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
