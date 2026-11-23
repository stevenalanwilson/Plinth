import { logger } from '../logger';
import { musicBrainzFetch } from '../repositories/musicBrainzClient';
import { AlbumToSave } from './albumService';
import { creditedArtist, ReleaseGroupCandidate, releaseYear } from './albumMatchService';

const LOOKUP_BUDGET_MS = 10_000;
const MAX_GENRES = 3;

interface MusicBrainzGenre {
  readonly name: string;
  readonly count?: number;
}

interface ReleaseGroupRecord extends ReleaseGroupCandidate {
  readonly genres?: readonly MusicBrainzGenre[];
}

export type AlbumByIdLookup =
  | { readonly status: 'found'; readonly album: AlbumToSave }
  | { readonly status: 'not_found' }
  | { readonly status: 'lookup_failed' };

function capitalise(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The most agreed-on genres first, so a handful of votes don't outrank a well-known one. */
function topGenres(record: ReleaseGroupRecord): string[] {
  return [...(record.genres ?? [])]
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, MAX_GENRES)
    .map((genre) => capitalise(genre.name));
}

/**
 * Looks an album up in MusicBrainz by its release group ID, for when the album must be what
 * MusicBrainz says it is, not what a request says. Only albums count: a single or an EP with the
 * same ID is not found. A lookup that couldn't be made says so, rather than saying not found.
 */
export async function lookUpAlbumById(
  releaseGroupId: string,
  budgetSignal: AbortSignal = AbortSignal.timeout(LOOKUP_BUDGET_MS),
): Promise<AlbumByIdLookup> {
  try {
    const res = await musicBrainzFetch(
      `release-group/${releaseGroupId}?inc=artist-credits+genres&fmt=json`,
      budgetSignal,
    );
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) {
      logger.warn({ releaseGroupId, status: res.status }, 'album lookup by id failed');
      return { status: 'lookup_failed' };
    }

    const record = (await res.json()) as ReleaseGroupRecord;
    const artist = creditedArtist(record);
    if (record['primary-type'] !== 'Album' || !record.title || !artist) {
      return { status: 'not_found' };
    }

    return {
      status: 'found',
      album: {
        releaseGroupId,
        artist,
        album: record.title,
        year: releaseYear(record),
        hook: null,
        genres: topGenres(record),
        country: null,
      },
    };
  } catch (error) {
    logger.warn(
      { releaseGroupId, error: error instanceof Error ? error.message : String(error) },
      'album lookup by id failed',
    );
    return { status: 'lookup_failed' };
  }
}
