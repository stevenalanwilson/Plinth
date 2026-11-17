export const SLIDER_MIN = 1;
export const SLIDER_MAX = 10;
export const MAX_PREFERENCE_ARRAY_LENGTH = 50;

export const ERA_VALUES = ['pre-80s', '80s-90s', '00s-10s', 'recent', 'any'] as const;
export type Era = (typeof ERA_VALUES)[number];

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

export type PivotType = 'more-like-this' | 'something-different';

export interface PivotHint {
  readonly type: PivotType;
  readonly artist: string;
  readonly album: string;
}

export interface ArtistRelation {
  readonly name: string;
  readonly type: string;
}

export interface ArtistRelationsResponse {
  readonly relations: readonly ArtistRelation[];
}

export interface RecommendationRequest {
  readonly preferences: RecommendationPreferences;
  readonly alreadySuggested: readonly string[];
  readonly pivot?: PivotHint;
  readonly seedArtist?: string;
  readonly vibeQuery?: string;
  /**
   * Set on the first pick of a visit that began on a shared album link, so the server can count
   * how many of those visitors go on to try a pick of their own. Carries nothing about them.
   */
  readonly entry?: VisitEntry;
}

export const VISIT_ENTRIES = ['shared-link'] as const;
export type VisitEntry = (typeof VISIT_ENTRIES)[number];

export interface RecommendationResponse {
  readonly artist: string;
  readonly album: string;
  readonly year: string;
  readonly reason: string;
  readonly genres?: readonly string[];
  readonly country?: string;
  /** MusicBrainz release group the pick was matched to; absent if it couldn't be checked. */
  readonly releaseGroupId?: string;
  /** One line about the album itself, not the listener, for its public page and link previews. */
  readonly hook?: string;
  /** The album's permalink, /album/{slug}; absent for picks that couldn't be checked or saved. */
  readonly slug?: string;
}

/** A stored album with a permalink, from GET /api/v1/albums/:slug. */
export interface AlbumResponse {
  readonly slug: string;
  readonly releaseGroupId: string;
  readonly artist: string;
  readonly album: string;
  readonly year: string | null;
  readonly hook: string | null;
  readonly genres: readonly string[];
  readonly country: string | null;
  readonly artworkUrl: string | null;
  readonly appleMusicUrl: string | null;
}

export interface AlbumTrack {
  /** As printed on the release: "A1" on vinyl, "3" on a CD. */
  readonly number: string;
  readonly title: string;
  readonly lengthSeconds: number | null;
}

export interface AlbumDisc {
  readonly position: number;
  /** A disc's own title, e.g. "Bonus disc"; null for most. */
  readonly title: string | null;
  /** e.g. '12" Vinyl', "CD". */
  readonly format: string | null;
  readonly tracks: readonly AlbumTrack[];
}

/** The earliest official release of an album, which is usually the original pressing. */
export interface AlbumReleaseInfo {
  /** "1980", "1980-11" or "1980-11-21", as precisely as MusicBrainz knows it. */
  readonly date: string | null;
  /** A MusicBrainz country code, including "XW" (worldwide) and "XE" (Europe). */
  readonly country: string | null;
  readonly label: string | null;
  readonly catalogueNumber: string | null;
}

export interface RelatedAlbum {
  readonly title: string;
  readonly year: string | null;
}

/** From GET /api/v1/albums/:slug/details. */
export interface AlbumDetailsResponse {
  readonly release: AlbumReleaseInfo | null;
  /** Every format the album has been released on, e.g. '12" Vinyl', "CD", "Digital Media". */
  readonly formats: readonly string[];
  readonly discs: readonly AlbumDisc[];
  /** Null when the artist's other albums couldn't be looked up. */
  readonly moreFromArtist: {
    readonly artist: string;
    readonly albums: readonly RelatedAlbum[];
  } | null;
}

export interface ArtworkResponse {
  readonly artworkUrl: string | null;
  readonly year: string | null;
  readonly appleMusicUrl: string | null;
}

export interface EssentialAlbum {
  readonly album: string;
  readonly year: string;
  readonly reason: string;
  /** MusicBrainz release group the album was matched to; absent if it couldn't be checked. */
  readonly releaseGroupId?: string;
  /** One of the two or three albums a newcomer should start with. */
  readonly startHere?: boolean;
}

/** An album in an artist's discography, from MusicBrainz. */
export interface DiscographyAlbum {
  readonly title: string;
  readonly year: string | null;
  readonly releaseGroupId: string;
}

export interface ArtistEssentialsRequest {
  readonly artist: string;
}

export interface ArtistEssentialsResponse {
  readonly artist: string;
  readonly albums: readonly EssentialAlbum[];
  /**
   * The artist's studio albums, plus any essential album that isn't one (a live album, say),
   * oldest first. Absent when the list couldn't be checked against MusicBrainz.
   */
  readonly discography?: readonly DiscographyAlbum[];
}
