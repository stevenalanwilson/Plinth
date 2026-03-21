export type Era = 'pre-80s' | '80s-90s' | '00s-10s' | 'recent' | 'any';

export interface RecommendationPreferences {
  readonly genres: readonly string[];
  readonly moods: readonly string[];
  readonly tempo: number; // 1–10, 1 = slow, 10 = fast
  readonly energy: number; // 1–10, 1 = mellow, 10 = intense
  readonly density: number; // 1–10, 1 = sparse, 10 = dense
  readonly era: Era;
  readonly includeFamiliarArtists: boolean;
  readonly prioritiseObscure: boolean;
  readonly stayFocused: boolean;
}

export interface RecommendationRequest {
  readonly preferences: RecommendationPreferences;
  readonly alreadySuggested: readonly string[];
}

export interface RecommendationResponse {
  readonly artist: string;
  readonly album: string;
  readonly year: string;
  readonly reason: string;
}

export interface ArtworkResponse {
  readonly artworkUrl: string | null;
  readonly year: string | null;
  readonly appleMusicUrl: string | null;
}
