import { RecommendationResponse, ArtworkResponse } from '@shared/types';

export interface HistoryEntry {
  readonly id: string;
  readonly recommendation: RecommendationResponse;
  readonly artworkResponse: ArtworkResponse;
}
