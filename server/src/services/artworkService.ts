import { ArtworkResponse } from '@shared/types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { cachedResponse } from '../repositories/lookupCache';
import { artistsMatch, titlesMatch } from '../utils/musicNames';
import { logger } from '../logger';
import { findAlbum } from './albumMatchService';

// Total time budget for the full artwork lookup (MusicBrainz + CAA + iTunes).
// Ensures the request never hangs indefinitely even if individual timeouts are each hit.
const REQUEST_BUDGET_MS = 30_000;

interface CoverArtImage {
  front?: boolean;
  image: string;
  thumbnails?: {
    '500'?: string;
    '250'?: string;
    small?: string;
  };
}

interface CoverArtResult {
  images?: CoverArtImage[];
}

interface ItunesAlbum {
  collectionName: string;
  artistName: string;
  collectionViewUrl: string;
  artworkUrl100?: string;
}

interface ItunesSearchResult {
  results: ItunesAlbum[];
}

interface ItunesData {
  appleMusicUrl: string | null;
  artworkUrl: string | null;
}

const NO_ITUNES_DATA: ItunesData = { appleMusicUrl: null, artworkUrl: null };

// Apple's catalogue changes slowly, and an album that isn't there today may be next week.
const ITUNES_CACHE_SECONDS = 24 * 60 * 60;

async function fetchCoverArt(
  releaseGroupId: string,
  budgetSignal: AbortSignal,
): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://coverartarchive.org/release-group/${releaseGroupId}`,
    budgetSignal,
  );
  if (!res.ok) return null;

  const data = (await res.json()) as CoverArtResult;
  const front = data.images?.find((image) => image.front) ?? data.images?.[0];
  if (!front) return null;
  return (
    front.thumbnails?.['500'] ?? front.thumbnails?.['250'] ?? front.thumbnails?.small ?? front.image
  );
}

async function fetchItunesDataOnce(
  artist: string,
  album: string,
  budgetSignal: AbortSignal,
): Promise<ItunesData> {
  const term = encodeURIComponent(`${artist} ${album}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=5`;
  const res = await cachedResponse({
    namespace: 'itunes',
    key: url,
    ttlSeconds: () => ITUNES_CACHE_SECONDS,
    fetch: () => fetchWithTimeout(url, budgetSignal),
  });
  if (!res.ok) return NO_ITUNES_DATA;

  const data = (await res.json()) as ItunesSearchResult;
  // Only an exact match will do: the closest result for an album iTunes doesn't carry can be
  // anything, e.g. Jeopardy! TV theme singles for The Sound's "Jeopardy".
  const match = data.results?.find(
    (result) =>
      titlesMatch(album, result.collectionName) && artistsMatch(artist, result.artistName),
  );
  if (!match) return NO_ITUNES_DATA;

  // artworkUrl100 is 100×100; replace to get 500×500
  const artworkUrl = match.artworkUrl100?.replace('100x100bb', '500x500bb') ?? null;
  return { appleMusicUrl: match.collectionViewUrl ?? null, artworkUrl };
}

async function fetchItunesData(
  artist: string,
  album: string,
  budgetSignal: AbortSignal,
): Promise<ItunesData> {
  // Retry once on transient failure before giving up.
  // AbortErrors end the lookup immediately — retrying a cancelled request is pointless.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchItunesDataOnce(artist, album, budgetSignal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return NO_ITUNES_DATA;
    }
  }
  return NO_ITUNES_DATA;
}

function artworkSource(coverArtUrl: string | null, itunesArtworkUrl: string | null): string {
  if (coverArtUrl) return 'cover-art-archive';
  if (itunesArtworkUrl) return 'itunes';
  return 'none';
}

/**
 * Finds artwork only for a confident match. No artwork is better than the wrong artwork:
 * the client shows a placeholder sleeve instead. A release group ID from an already-checked
 * recommendation skips the MusicBrainz search.
 */
export async function fetchArtwork(
  artist: string,
  album: string,
  releaseGroupId?: string,
): Promise<ArtworkResponse> {
  const budgetSignal = AbortSignal.timeout(REQUEST_BUDGET_MS);

  const lookup = releaseGroupId ? null : await findAlbum({ artist, album }, budgetSignal);
  const match = lookup?.status === 'matched' ? lookup.match : null;
  const matchedGroupId = releaseGroupId ?? match?.releaseGroupId ?? null;

  const coverArtUrl = matchedGroupId
    ? await fetchCoverArt(matchedGroupId, budgetSignal).catch(() => null)
    : null;
  const itunesData = await fetchItunesData(artist, album, budgetSignal);

  logger.info(
    {
      artist,
      album,
      releaseGroupId: matchedGroupId,
      source: artworkSource(coverArtUrl, itunesData.artworkUrl),
    },
    'artwork source',
  );

  return {
    artworkUrl: coverArtUrl ?? itunesData.artworkUrl,
    year: match?.year ?? null,
    appleMusicUrl: itunesData.appleMusicUrl,
  };
}
