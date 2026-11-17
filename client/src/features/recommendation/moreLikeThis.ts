import { PivotHint } from '@shared/types';

/** Navigation state that asks the Discover page to start a "more like this" pick. */
export interface MoreLikeThisState {
  readonly moreLikeThis: { readonly artist: string; readonly album: string };
}

export function moreLikeThisState(artist: string, album: string): MoreLikeThisState {
  return { moreLikeThis: { artist, album } };
}

/** The pivot asked for in navigation state, or null if there isn't a valid one. */
export function pivotFromState(state: unknown): PivotHint | null {
  if (typeof state !== 'object' || state === null || !('moreLikeThis' in state)) return null;
  const { moreLikeThis } = state as { moreLikeThis: unknown };
  if (typeof moreLikeThis !== 'object' || moreLikeThis === null) return null;
  const { artist, album } = moreLikeThis as Record<string, unknown>;
  if (typeof artist !== 'string' || typeof album !== 'string' || !artist || !album) return null;
  return { type: 'more-like-this', artist, album };
}
