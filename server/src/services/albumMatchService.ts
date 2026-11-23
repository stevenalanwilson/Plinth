import { escapeLucene, musicBrainzFetch } from '../repositories/musicBrainzClient';
import { logger } from '../logger';
import { artistsMatch, normaliseName, titlesMatch } from '../utils/musicNames';

const LOOKUP_BUDGET_MS = 10_000;
const ARTIST_LOOKUP_BUDGET_MS = 15_000;
const SEARCH_LIMIT = 10;
const BROWSE_PAGE_SIZE = 100;
// Three pages covers all but the most prolific catalogues while keeping the lookup to a few seconds.
const MAX_BROWSE_PAGES = 3;

interface MusicBrainzArtistCredit {
  readonly name: string;
  readonly joinphrase?: string;
}

export interface ReleaseGroupCandidate {
  readonly id: string;
  readonly title: string;
  readonly score?: number;
  readonly 'primary-type'?: string;
  readonly 'secondary-types'?: readonly string[];
  readonly 'first-release-date'?: string;
  readonly 'artist-credit'?: readonly MusicBrainzArtistCredit[];
}

interface ReleaseGroupSearchResult {
  readonly 'release-groups'?: readonly ReleaseGroupCandidate[];
}

interface ReleaseGroupBrowseResult extends ReleaseGroupSearchResult {
  readonly 'release-group-count'?: number;
}

interface ArtistSearchResult {
  readonly artists?: readonly { readonly id: string; readonly name: string }[];
}

export interface AlbumQuery {
  readonly artist: string;
  readonly album: string;
  readonly year?: string;
}

export interface AlbumMatch {
  readonly releaseGroupId: string;
  readonly artist: string;
  readonly album: string;
  readonly year: string | null;
}

export type AlbumLookup =
  | { readonly status: 'matched'; readonly match: AlbumMatch }
  | { readonly status: 'not_found' }
  | { readonly status: 'lookup_failed' };

export function creditedArtist(candidate: ReleaseGroupCandidate): string {
  return (candidate['artist-credit'] ?? [])
    .map((credit) => `${credit.name}${credit.joinphrase ?? ''}`)
    .join('');
}

function creditMatches(candidate: ReleaseGroupCandidate, artist: string): boolean {
  const credits = candidate['artist-credit'] ?? [];
  return (
    artistsMatch(artist, creditedArtist(candidate)) ||
    credits.some((credit) => artistsMatch(artist, credit.name))
  );
}

/**
 * The name to show for a matched album. A long classical credit lists every performer
 * ("Arvo Pärt; Gidon Kremer, Keith Jarrett, …"), so unless the requested artist is the whole
 * credit, show the credited artist they asked for.
 */
function displayArtist(candidate: ReleaseGroupCandidate, requested: string): string {
  const fullCredit = creditedArtist(candidate);
  if (normaliseName(fullCredit) === normaliseName(requested)) return fullCredit;
  const matchingCredit = (candidate['artist-credit'] ?? []).find((credit) =>
    artistsMatch(requested, credit.name),
  );
  return matchingCredit?.name ?? (fullCredit || requested);
}

function titleMatches(candidate: ReleaseGroupCandidate, album: string): boolean {
  if (titlesMatch(album, candidate.title)) return true;
  // Some titles lead with the artist, e.g. "Clifford Brown and Max Roach at Basin Street".
  return (
    normaliseName(candidate.title) ===
    `${normaliseName(creditedArtist(candidate))} ${normaliseName(album)}`
  );
}

export function releaseYear(candidate: ReleaseGroupCandidate): string | null {
  return candidate['first-release-date']?.substring(0, 4) || null;
}

function yearDistance(candidate: ReleaseGroupCandidate, requestedYear: number): number {
  if (Number.isNaN(requestedYear)) return 0;
  const year = Number.parseInt(releaseYear(candidate) ?? '', 10);
  return Number.isNaN(year) ? Number.POSITIVE_INFINITY : Math.abs(year - requestedYear);
}

/**
 * Picks the release group that is confidently the requested album: an Album whose title and
 * artist both match. The year only breaks ties, since Claude is often a year out.
 */
export function selectAlbumMatch(
  candidates: readonly ReleaseGroupCandidate[],
  query: AlbumQuery,
): AlbumMatch | null {
  const requestedYear = Number.parseInt(query.year ?? '', 10);
  const confident = candidates.filter(
    (candidate) =>
      candidate['primary-type'] === 'Album' &&
      titleMatches(candidate, query.album) &&
      creditMatches(candidate, query.artist),
  );

  const [best] = [...confident].sort(
    (a, b) =>
      yearDistance(a, requestedYear) - yearDistance(b, requestedYear) ||
      (a['secondary-types']?.length ?? 0) - (b['secondary-types']?.length ?? 0) ||
      (b.score ?? 0) - (a.score ?? 0),
  );
  if (!best) return null;

  return {
    releaseGroupId: best.id,
    artist: displayArtist(best, query.artist),
    album: best.title,
    year: releaseYear(best),
  };
}

// Lower-cased so words in a title such as "AND" aren't read as search operators.
function searchTerms(value: string): string {
  return escapeLucene(value.toLowerCase());
}

function searchPath(query: AlbumQuery): string {
  const lucene = `releasegroup:(${searchTerms(query.album)}) AND artist:(${searchTerms(query.artist)}) AND primarytype:album`;
  return `release-group?query=${encodeURIComponent(lucene)}&limit=${SEARCH_LIMIT}&fmt=json`;
}

function describeCandidate(candidate: ReleaseGroupCandidate | undefined): string | null {
  return candidate ? `${creditedArtist(candidate)} – ${candidate.title}` : null;
}

/** Looks the album up in MusicBrainz and reports whether it confidently exists. */
export async function findAlbum(
  query: AlbumQuery,
  budgetSignal: AbortSignal = AbortSignal.timeout(LOOKUP_BUDGET_MS),
): Promise<AlbumLookup> {
  const context = { artist: query.artist, album: query.album, year: query.year };

  try {
    const res = await musicBrainzFetch(searchPath(query), budgetSignal);
    if (!res.ok) {
      logger.warn({ ...context, outcome: 'lookup_failed', status: res.status }, 'album match');
      return { status: 'lookup_failed' };
    }

    const candidates = ((await res.json()) as ReleaseGroupSearchResult)['release-groups'] ?? [];
    const match = selectAlbumMatch(candidates, query);
    if (!match) {
      // The closest candidate shows whether a miss is a made-up album or a matching gap.
      logger.info(
        { ...context, outcome: 'not_found', closest: describeCandidate(candidates[0]) },
        'album match',
      );
      return { status: 'not_found' };
    }

    logger.info(
      { ...context, outcome: 'matched', releaseGroupId: match.releaseGroupId },
      'album match',
    );
    return { status: 'matched', match };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ ...context, outcome: 'lookup_failed', error: message }, 'album match');
    return { status: 'lookup_failed' };
  }
}

export type ArtistAlbumsLookup =
  | {
      readonly status: 'found';
      readonly artist: string;
      readonly albums: readonly ReleaseGroupCandidate[];
      /** IDs of the albums the artist's MusicBrainz page lists; null if they couldn't be fetched. */
      readonly listedIds: ReadonlySet<string> | null;
    }
  | { readonly status: 'not_found' }
  | { readonly status: 'lookup_failed' };

/**
 * Which of an artist's albums to fetch. `all` is everything MusicBrainz has, bootlegs included;
 * `listed` is what the artist's MusicBrainz page lists, leaving out release groups whose
 * releases are all bootleg, promotional or pseudo-releases.
 */
export type CatalogueScope = 'all' | 'listed';

function browseAlbumsPath(artistId: string, scope: CatalogueScope, page: number): string {
  const status = scope === 'listed' ? '&release-group-status=website-default' : '';
  return `release-group?artist=${artistId}&type=album${status}&inc=artist-credits&limit=${BROWSE_PAGE_SIZE}&offset=${page * BROWSE_PAGE_SIZE}&fmt=json`;
}

export async function browseArtistAlbums(
  artistId: string,
  budgetSignal: AbortSignal,
  scope: CatalogueScope = 'all',
): Promise<ReleaseGroupCandidate[] | null> {
  const albums: ReleaseGroupCandidate[] = [];
  for (let page = 0; page < MAX_BROWSE_PAGES; page++) {
    const res = await musicBrainzFetch(browseAlbumsPath(artistId, scope, page), budgetSignal);
    if (!res.ok) return null;

    const data = (await res.json()) as ReleaseGroupBrowseResult;
    const batch = data['release-groups'] ?? [];
    albums.push(...batch);
    if (batch.length === 0 || albums.length >= (data['release-group-count'] ?? 0)) break;
  }
  return albums;
}

/**
 * The IDs of the albums the artist's page lists, or null if MusicBrainz couldn't supply them.
 * They only tidy what is shown, so a failure here mustn't fail the lookup. MusicBrainz returns
 * both browses in the same order (by ID) and the listed albums are a subset, so even when both
 * stop at MAX_BROWSE_PAGES, every listed album in the full pages is in the listed pages too.
 */
async function listedAlbumIds(
  artistId: string,
  budgetSignal: AbortSignal,
): Promise<ReadonlySet<string> | null> {
  try {
    const listed = await browseArtistAlbums(artistId, budgetSignal, 'listed');
    return listed ? new Set(listed.map((album) => album.id)) : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a known artist's albums, and which of them their page lists, as the lookup result.
 * `artist` is what the lookup was asked for, for the log.
 */
async function lookUpAlbumsOf(
  found: { readonly id: string; readonly name: string },
  artist: string,
  budgetSignal: AbortSignal,
): Promise<ArtistAlbumsLookup> {
  const albums = await browseArtistAlbums(found.id, budgetSignal);
  if (!albums) {
    logger.warn({ artist, outcome: 'lookup_failed' }, 'artist albums');
    return { status: 'lookup_failed' };
  }

  // Albums are verified against the whole catalogue, so a pick that exists only as a bootleg
  // still counts; the listed IDs keep such albums out of what is shown as the discography.
  const listedIds = await listedAlbumIds(found.id, budgetSignal);
  if (!listedIds) logger.warn({ artist, artistId: found.id }, 'listed albums unavailable');

  logger.info(
    {
      artist,
      outcome: 'found',
      artistId: found.id,
      albumCount: albums.length,
      listedCount: listedIds?.size ?? null,
    },
    'artist albums',
  );
  return { status: 'found', artist: found.name, albums, listedIds };
}

/**
 * Finds the artist in MusicBrainz and fetches their albums, so a whole list of picks can be
 * checked with a few requests instead of one search per album.
 */
export async function findArtistAlbums(
  artist: string,
  budgetSignal: AbortSignal = AbortSignal.timeout(ARTIST_LOOKUP_BUDGET_MS),
): Promise<ArtistAlbumsLookup> {
  try {
    const searchRes = await musicBrainzFetch(
      `artist?query=${encodeURIComponent(`artist:(${searchTerms(artist)})`)}&limit=5&fmt=json`,
      budgetSignal,
    );
    if (!searchRes.ok) {
      logger.warn({ artist, outcome: 'lookup_failed', status: searchRes.status }, 'artist albums');
      return { status: 'lookup_failed' };
    }

    const candidates = ((await searchRes.json()) as ArtistSearchResult).artists ?? [];
    const found = candidates.find((candidate) => artistsMatch(artist, candidate.name));
    if (!found) {
      logger.info(
        { artist, outcome: 'not_found', closest: candidates[0]?.name ?? null },
        'artist albums',
      );
      return { status: 'not_found' };
    }

    return await lookUpAlbumsOf(found, artist, budgetSignal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ artist, outcome: 'lookup_failed', error: message }, 'artist albums');
    return { status: 'lookup_failed' };
  }
}

/**
 * Fetches the albums of an artist already chosen by their MusicBrainz ID, where a name could
 * mean any of several artists. No search is needed, so it is quicker than findArtistAlbums.
 */
export async function findArtistAlbumsById(
  artistId: string,
  name: string,
  budgetSignal: AbortSignal = AbortSignal.timeout(ARTIST_LOOKUP_BUDGET_MS),
): Promise<ArtistAlbumsLookup> {
  try {
    return await lookUpAlbumsOf({ id: artistId, name }, name, budgetSignal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ artist: name, outcome: 'lookup_failed', error: message }, 'artist albums');
    return { status: 'lookup_failed' };
  }
}
