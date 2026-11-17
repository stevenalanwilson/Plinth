import { RecommendationResponse, ArtworkResponse } from '@shared/types';
import { Feedback } from './feedback';

export interface HistoryEntry {
  readonly id: string;
  readonly recommendation: RecommendationResponse;
  readonly artworkResponse: ArtworkResponse;
  readonly createdAt: string; // ISO 8601
  /** The listener's verdict on the album; absent until they give one. */
  readonly feedback?: Feedback;
}
