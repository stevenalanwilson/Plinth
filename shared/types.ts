export interface LibraryData {
  readonly artists: readonly string[];
  readonly albums: readonly string[];
  readonly trackCount: number;
}

export interface RecommendationRequest {
  readonly artistList: readonly string[];
  readonly albumList: readonly string[];
  readonly alreadySuggested: readonly string[];
  readonly genre?: string;
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
