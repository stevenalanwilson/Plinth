export const SLIDER_MIN = 1;
export const SLIDER_MAX = 10;
export const MAX_PREFERENCE_ARRAY_LENGTH = 50;
// Every album the listener has rated is checked in code, so this is generous; the samples that
// steer the prompt are kept short.
export const MAX_TASTE_AVOID = 500;
export const MAX_TASTE_SAMPLE = 12;

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

/**
 * What the listener has said about albums, so a pick can lean towards their taste and never
 * repeat what they have rated. Every album is written "Artist – Album".
 */
export interface TasteHint {
  /** Every album they have given a verdict on: never picked again, even as a last resort. */
  readonly avoid: readonly string[];
  /** Albums they own, want or saved: a gentle lean. */
  readonly liked: readonly string[];
  /** Albums they said are not for them: steer away from similar ones. */
  readonly disliked: readonly string[];
}

export interface RecommendationRequest {
  readonly preferences: RecommendationPreferences;
  readonly alreadySuggested: readonly string[];
  readonly pivot?: PivotHint;
  readonly seedArtist?: string;
  readonly vibeQuery?: string;
  readonly taste?: TasteHint;
  /** Which pick this is in the visit (1 for the first), counted per browser tab session. */
  readonly pickNumber?: number;
  /**
   * How many different albums the listener has answered in this visit. Only a count, so the
   * server can see whether the crate is being used without knowing who is using it.
   */
  readonly ratedThisVisit?: number;
  /**
   * Set on the first pick of a visit that began on a shared album link, so the server can count
   * how many of those visitors go on to try a pick of their own. Carries nothing about them.
   */
  readonly entry?: VisitEntry;
}

// A sanity limit on the visit counts below, not a target: a real visit never comes near it.
export const MAX_VISIT_COUNT = 1000;

export interface SignInLinkRequest {
  readonly email: string;
}

export interface SignInVerifyRequest {
  readonly token: string;
}

/** Who this device is signed in as, or null while it is anonymous. */
export interface AccountResponse {
  readonly account: { readonly email: string } | null;
}

/**
 * Who this device is signed in as, and whether signing in is switched on at all. Absent means
 * unknown, which is treated as on: an old server never says.
 */
export interface AccountStatusResponse extends AccountResponse {
  readonly signInAvailable?: boolean;
}

export const FEEDBACK_STATUSES = ['save', 'own', 'want-vinyl', 'heard', 'not-for-me'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** What the listener said about an album. One status at a time; tapping it again clears it. */
export interface Feedback {
  /**
   * Null once a rating has been cleared. The timestamp is kept, so that when libraries are synced
   * between devices, "cleared" can be told apart from "never rated" and a stale copy can't bring
   * a cleared rating back.
   */
  readonly status: FeedbackStatus | null;
  /** ISO 8601: when the status last changed, so the newer of two copies wins. */
  readonly at: string;
}

// Picks nobody rated are a log of what was suggested, so they roll off. Anything the listener
// rated is their crate and is kept for good: owning an album doesn't expire. The server applies
// the same rule to a saved crate, so every device ends up with the same albums.
export const UNRATED_MAX_AGE_DAYS = 90;
export const UNRATED_MAX_ENTRIES = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

interface RatableAlbum {
  readonly createdAt: string;
  readonly feedback?: Feedback;
}

/** True when the listener has given the album a status (a cleared rating doesn't count). */
export function isRated(album: Pick<RatableAlbum, 'feedback'>): boolean {
  return album.feedback?.status != null;
}

/** When the listener last did something to the album: picked it, or changed what they said. */
export function changedAt(album: RatableAlbum): number {
  const picked = Date.parse(album.createdAt);
  return album.feedback ? Math.max(picked, Date.parse(album.feedback.at)) : picked;
}

/**
 * Applies the retention rules to a library kept newest first: every rated album stays, and of the
 * rest only the newest few, within the age limit. The order is left as it is.
 */
export function pruneLibrary<T extends RatableAlbum>(
  albums: readonly T[],
  now: number = Date.now(),
): T[] {
  const cutoff = now - UNRATED_MAX_AGE_DAYS * DAY_MS;
  let unratedKept = 0;

  return albums.filter((album) => {
    if (isRated(album)) return true;
    // Written as "not newer than" so a date that doesn't parse drops the album, as it always has.
    if (!(new Date(album.createdAt).getTime() > cutoff)) return false;
    unratedKept += 1;
    return unratedKept <= UNRATED_MAX_ENTRIES;
  });
}

/** What makes two picks the same album when neither has been matched to a MusicBrainz release. */
export function albumNameKey({ artist, album }: { artist: string; album: string }): string {
  return `${artist.toLowerCase()}|${album.toLowerCase()}`;
}

/** An album in a saved crate: everything a device keeps about it, apart from its own local id. */
export interface LibraryItem {
  readonly recommendation: RecommendationResponse;
  readonly artwork: ArtworkResponse;
  /** ISO 8601: when the album was first picked. */
  readonly createdAt: string;
  readonly feedback?: Feedback;
}

/** An album taken out of the crate. `key` is albumNameKey; `at` is when it was removed. */
export interface LibraryDeletion {
  readonly key: string;
  readonly at: string;
}

/** At most this many in one request, so a big crate is saved in several. */
export const LIBRARY_SYNC_MAX_ITEMS = 100;
export const LIBRARY_SYNC_MAX_DELETIONS = 500;

/**
 * POST /api/v1/library/sync: what this device changed, and the point it last heard from the
 * server (null the first time). Repeating a request changes nothing.
 */
export interface LibrarySyncRequest {
  readonly since: string | null;
  readonly items: readonly LibraryItem[];
  readonly deletions: readonly LibraryDeletion[];
}

/** What the server holds for this account that has changed since `since`, and where to resume. */
export interface LibrarySyncResponse {
  readonly items: readonly LibraryItem[];
  readonly deletions: readonly LibraryDeletion[];
  readonly cursor: string;
  /**
   * True when what the account holds is more than one answer carries: ask again, from `cursor`,
   * for the rest. Absent when this is all of it.
   */
  readonly more?: boolean;
}

/** Sent with a 429 when a daily limit is used up, so it can be told from a request that came too fast. */
export const DAILY_LIMIT_CODE = 'daily-limit';

/** Sent with a pick so the server can tell a retry from a new request. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

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
}

/** An essential album by someone connected to the artist searched for: a member, a producer. */
export interface ConnectedAlbum extends EssentialAlbum {
  /** Who made the album: not the artist searched for. */
  readonly artist: string;
  /** How they are connected to that artist, such as "Guitarist's solo debut". */
  readonly connection: string;
}

/** From POST /api/v1/devices: the secret a browser or app sends from then on, shown only once. */
export interface DeviceRegistrationResponse {
  readonly token: string;
}

export interface ArtistEssentialsRequest {
  readonly artist: string;
}

export interface ArtistEssentialsResponse {
  readonly artist: string;
  /** Two or three of the artist's own albums to start with, in the order to listen. */
  readonly albums: readonly EssentialAlbum[];
  /** Essential albums by people connected to the artist, which may be none that could be checked. */
  readonly related: readonly ConnectedAlbum[];
}
