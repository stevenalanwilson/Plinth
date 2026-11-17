import { ArtistEssentialsResponse, EssentialAlbum } from '@shared/types';

/** A row in the discography: an essential album with its reason, or any other album. */
export interface DiscographyRow {
  readonly title: string;
  readonly year: string | null;
  readonly releaseGroupId: string;
  /** Set when the album is one of the essentials. */
  readonly essential: EssentialAlbum | null;
}

export type EssentialsLayout =
  /** The albums to start with, then the rest of the discography in order. */
  | {
      readonly kind: 'discography';
      readonly startHere: readonly EssentialAlbum[];
      readonly rest: readonly DiscographyRow[];
    }
  /** No discography (MusicBrainz was down), so the other essentials follow on their own. */
  | {
      readonly kind: 'essentials';
      readonly startHere: readonly EssentialAlbum[];
      readonly rest: readonly EssentialAlbum[];
    }
  /** Nothing marked to start with, as in lists from before the marks: shown as one list. */
  | { readonly kind: 'list'; readonly albums: readonly EssentialAlbum[] };

/** Decides how to show an essentials list, from the fields it actually has. */
export function layOutEssentials(result: ArtistEssentialsResponse): EssentialsLayout {
  const startHere = result.albums.filter((album) => album.startHere === true);
  if (startHere.length === 0) return { kind: 'list', albums: result.albums };

  const others = result.albums.filter((album) => album.startHere !== true);
  if (!result.discography) return { kind: 'essentials', startHere, rest: others };

  const startHereIds = new Set(startHere.map((album) => album.releaseGroupId));
  const essentialsById = new Map(others.map((album) => [album.releaseGroupId, album]));
  const rest = result.discography
    .filter((album) => !startHereIds.has(album.releaseGroupId))
    .map((album) => ({ ...album, essential: essentialsById.get(album.releaseGroupId) ?? null }));

  return { kind: 'discography', startHere, rest };
}

/** The album's front cover from the Cover Art Archive, which may not have one. */
export function coverArtUrl(releaseGroupId: string): string {
  return `https://coverartarchive.org/release-group/${encodeURIComponent(releaseGroupId)}/front-250`;
}
