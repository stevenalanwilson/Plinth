import { albumNameKey, RecommendationResponse } from '@shared/types';

type NamedAlbum = Pick<RecommendationResponse, 'artist' | 'album' | 'releaseGroupId'>;

/**
 * The keys an album is recognised by: its MusicBrainz release group when the pick was matched to
 * one, and its name either way, since older picks have no release group.
 */
export function albumKeys({ artist, album, releaseGroupId }: NamedAlbum): string[] {
  const keys = [`name:${albumNameKey({ artist, album })}`];
  if (releaseGroupId) keys.push(`release-group:${releaseGroupId}`);
  return keys;
}

/** The album as the server reads it in a request: "Artist – Album". */
export function albumLabel({ artist, album }: Pick<NamedAlbum, 'artist' | 'album'>): string {
  return `${artist} – ${album}`;
}

/** True when both are the same album, whichever way each was recorded. */
export function isSameAlbum(first: NamedAlbum, second: NamedAlbum): boolean {
  const keys = new Set(albumKeys(first));
  return albumKeys(second).some((key) => keys.has(key));
}
