import { escapeLucene, musicBrainzFetch } from '../repositories/musicBrainzClient';
import { logger } from '../logger';
import { artistsMatch, normaliseName, titlesMatch } from '../utils/musicNames';

const LOOKUP_BUDGET_MS = 10_000;
const SEARCH_LIMIT = 10;

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

function creditedArtist(candidate: ReleaseGroupCandidate): string {
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

function releaseYear(candidate: ReleaseGroupCandidate): string | null {
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

function searchPath(query: AlbumQuery): string {
  // Lower-cased so words in a title such as "AND" aren't read as search operators.
  const terms = (value: string): string => escapeLucene(value.toLowerCase());
  const lucene = `releasegroup:(${terms(query.album)}) AND artist:(${terms(query.artist)}) AND primarytype:album`;
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
