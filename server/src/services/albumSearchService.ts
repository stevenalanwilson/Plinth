import { AlbumSearchResult } from '@shared/types';
import { logger } from '../logger';
import {
  escapeLucene,
  MusicBrainzBusyError,
  musicBrainzFetch,
} from '../repositories/musicBrainzClient';
import { normaliseName } from '../utils/musicNames';
import { creditedArtist, ReleaseGroupCandidate, releaseYear } from './albumMatchService';

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_SEARCH_QUERY_LENGTH = 80;
// More are asked for than shown, since reissues listed under two spellings are folded into one.
const REQUESTED_LIMIT = 15;
const RESULT_LIMIT = 8;
// Someone is waiting on a search, so it neither waits long for MusicBrainz nor holds a place in
// the line that an artist's essentials, which people are also waiting for, would need.
const SEARCH_BUDGET_MS = 5_000;
const MAX_QUEUE_MS = 2_000;

export type AlbumSearchOutcome =
  | { readonly status: 'found'; readonly results: readonly AlbumSearchResult[] }
  | { readonly status: 'unavailable' };

/** What is typed, with the spacing tidied. */
function tidy(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/**
 * A search for albums by what has been typed: every word must be in the title or the artist's
 * name, and the last, which may be half typed, is matched as a start. Only albums with an
 * official release count, which leaves out ones that only ever came out as bootlegs or promos.
 * Words are lower-cased so that "AND" in a title isn't read as a search operator.
 */
export function albumSearchPath(query: string): string {
  const words = tidy(query).toLowerCase().split(' ').map(escapeLucene);
  const terms = words.map((word, index) => {
    const term = index === words.length - 1 ? `${word}*` : word;
    return `(releasegroup:${term} OR artist:${term})`;
  });
  const lucene = `${terms.join(' AND ')} AND primarytype:album AND status:official`;
  return `release-group?query=${encodeURIComponent(lucene)}&limit=${REQUESTED_LIMIT}&fmt=json`;
}

function toResult(candidate: ReleaseGroupCandidate): AlbumSearchResult | null {
  const artist = creditedArtist(candidate);
  if (candidate['primary-type'] !== 'Album' || !candidate.id || !candidate.title || !artist) {
    return null;
  }
  return {
    releaseGroupId: candidate.id,
    artist,
    album: candidate.title,
    year: releaseYear(candidate),
  };
}

function toResults(candidates: readonly ReleaseGroupCandidate[]): AlbumSearchResult[] {
  const results: AlbumSearchResult[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const result = toResult(candidate);
    if (!result) continue;

    const key = `${normaliseName(result.artist)}|${normaliseName(result.album)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(result);
    if (results.length === RESULT_LIMIT) break;
  }
  return results;
}

/**
 * Albums that match what has been typed, best match first. A query that is too short or too
 * long finds nothing without asking. When MusicBrainz is busy or can't be reached the outcome is
 * 'unavailable', so a failed search isn't passed off as one that found nothing.
 */
export async function searchAlbums(
  rawQuery: string,
  budgetSignal: AbortSignal = AbortSignal.timeout(SEARCH_BUDGET_MS),
): Promise<AlbumSearchOutcome> {
  const query = tidy(rawQuery);
  if (query.length < MIN_SEARCH_QUERY_LENGTH || query.length > MAX_SEARCH_QUERY_LENGTH) {
    return { status: 'found', results: [] };
  }

  try {
    const res = await musicBrainzFetch(albumSearchPath(query), budgetSignal, {
      maxQueueMs: MAX_QUEUE_MS,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'album search failed');
      return { status: 'unavailable' };
    }
    const data = (await res.json()) as {
      readonly 'release-groups'?: readonly ReleaseGroupCandidate[];
    };
    return { status: 'found', results: toResults(data['release-groups'] ?? []) };
  } catch (error) {
    // A busy line is expected while essentials are being looked up, so it isn't worth a line.
    if (!(error instanceof MusicBrainzBusyError)) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'album search failed',
      );
    }
    return { status: 'unavailable' };
  }
}
