import { RecommendationResponse } from '@shared/types';

type NamedAlbum = Pick<RecommendationResponse, 'artist' | 'album' | 'releaseGroupId'>;

/**
 * The keys an album is recognised by: its MusicBrainz release group when the pick was matched to
 * one, and its name either way, since older picks have no release group.
 */
export function albumKeys({ artist, album, releaseGroupId }: NamedAlbum): string[] {
  const keys = [`name:${artist.toLowerCase()}|${album.toLowerCase()}`];
  if (releaseGroupId) keys.push(`release-group:${releaseGroupId}`);
  return keys;
}

/** True when both are the same album, whichever way each was recorded. */
export function isSameAlbum(first: NamedAlbum, second: NamedAlbum): boolean {
  const keys = new Set(albumKeys(first));
  return albumKeys(second).some((key) => keys.has(key));
}
