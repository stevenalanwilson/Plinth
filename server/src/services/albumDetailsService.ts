import { AlbumDetailsResponse, AlbumDisc, AlbumReleaseInfo, RelatedAlbum } from '@shared/types';
import { AlbumRepository } from '../repositories/albumRepository';
import { musicBrainzFetch } from '../repositories/musicBrainzClient';
import { logger } from '../logger';
import { browseArtistAlbums, ReleaseGroupCandidate } from './albumMatchService';

// Cold, this is up to three release pages, the tracklist and up to three pages of the artist's
// albums, each queued behind MusicBrainz's one request per second.
const DETAILS_BUDGET_MS = 25_000;
const RELEASE_PAGE_SIZE = 100;
// Popular albums have hundreds of releases; three pages finds the original pressing of almost all.
const MAX_RELEASE_PAGES = 3;
const MAX_RELATED_ALBUMS = 10;
const VARIOUS_ARTISTS_ID = '89ad4ac3-39f7-470e-963a-56509c546377';

interface MusicBrainzArtistCredit {
  readonly name?: string;
  readonly artist?: { readonly id?: string; readonly name?: string };
}

export interface MusicBrainzRelease {
  readonly id: string;
  readonly date?: string;
  readonly country?: string;
  readonly 'label-info'?: readonly {
    readonly 'catalog-number'?: string | null;
    readonly label?: { readonly name?: string } | null;
  }[];
  readonly media?: readonly { readonly format?: string | null; readonly 'track-count'?: number }[];
  readonly 'artist-credit'?: readonly MusicBrainzArtistCredit[];
}

interface ReleaseBrowseResult {
  readonly 'release-count'?: number;
  readonly releases?: readonly MusicBrainzRelease[];
}

export interface MusicBrainzMedium {
  readonly position?: number;
  readonly title?: string;
  readonly format?: string | null;
  readonly tracks?: readonly {
    readonly number?: string;
    readonly position?: number;
    readonly title?: string;
    readonly length?: number | null;
  }[];
}

interface ReleaseLookupResult {
  readonly media?: readonly MusicBrainzMedium[];
}

/** The details MusicBrainz must supply; without them nothing useful can be shown. */
export class AlbumDetailsUnavailableError extends Error {
  constructor() {
    super('Album details could not be loaded from MusicBrainz');
    this.name = 'AlbumDetailsUnavailableError';
  }
}

function trackCount(release: MusicBrainzRelease): number {
  return (release.media ?? []).reduce((total, medium) => total + (medium['track-count'] ?? 0), 0);
}

// A date can be "1980", "1980-11" or "1980-11-21". A year alone means "sometime in 1980", so it
// sorts as the end of the year: otherwise a French release dated just "1980" would beat the
// UK pressing of November 1980.
function sortableDate(date: string | undefined): string {
  if (!date) return '9999-99-99';
  const [year, month = '99', day = '99'] = date.split('-');
  return `${year}-${month}-${day}`;
}

/** The earliest release that has tracks, which is usually the original pressing. */
export function chooseRelease(releases: readonly MusicBrainzRelease[]): MusicBrainzRelease | null {
  const withTracks = releases.filter((release) => trackCount(release) > 0);
  // sort is stable, so releases with equal dates keep MusicBrainz's order.
  const sorted = [...withTracks].sort((a, b) =>
    sortableDate(a.date).localeCompare(sortableDate(b.date)),
  );
  return sorted[0] ?? null;
}

function releaseInfo(release: MusicBrainzRelease): AlbumReleaseInfo {
  const labelInfo = (release['label-info'] ?? []).find((entry) => entry.label?.name);
  return {
    date: release.date || null,
    country: release.country || null,
    label: labelInfo?.label?.name ?? null,
    catalogueNumber: labelInfo?.['catalog-number'] || null,
  };
}

// MusicBrainz lists some vinyl as "12" Vinyl" and some as plain "Vinyl".
const SIZED_VINYL = /^\d+"\s*Vinyl$/;

/**
 * Every format the album came out on, once each, in the order it first appeared. A plain "Vinyl"
 * is left out when a sized one such as '12" Vinyl' is listed, as it would read as a duplicate.
 */
function formatsOf(releases: readonly MusicBrainzRelease[]): string[] {
  const byDate = [...releases].sort((a, b) =>
    sortableDate(a.date).localeCompare(sortableDate(b.date)),
  );
  const formats = byDate.flatMap((release) =>
    (release.media ?? []).flatMap((medium) => (medium.format ? [medium.format] : [])),
  );
  const unique = [...new Set(formats)];
  return unique.some((format) => SIZED_VINYL.test(format))
    ? unique.filter((format) => format !== 'Vinyl')
    : unique;
}

export function toDiscs(media: readonly MusicBrainzMedium[]): AlbumDisc[] {
  return media.flatMap((medium, index) => {
    const tracks = (medium.tracks ?? []).map((track) => ({
      number: track.number || String(track.position ?? ''),
      title: track.title ?? '',
      lengthSeconds: typeof track.length === 'number' ? Math.round(track.length / 1000) : null,
    }));
    if (tracks.length === 0) return [];
    return [
      {
        position: medium.position ?? index + 1,
        title: medium.title || null,
        format: medium.format ?? null,
        tracks,
      },
    ];
  });
}

/** The artist's other studio albums, in release order, without the one being viewed. */
export function relatedAlbums(
  catalogue: readonly ReleaseGroupCandidate[],
  currentReleaseGroupId: string,
): RelatedAlbum[] {
  return catalogue
    .filter(
      (album) =>
        album.id !== currentReleaseGroupId && (album['secondary-types'] ?? []).length === 0,
    )
    .sort((a, b) =>
      sortableDate(a['first-release-date']).localeCompare(sortableDate(b['first-release-date'])),
    )
    .slice(0, MAX_RELATED_ALBUMS)
    .map((album) => ({
      title: album.title,
      year: album['first-release-date']?.slice(0, 4) || null,
    }));
}

async function browseReleases(
  releaseGroupId: string,
  budgetSignal: AbortSignal,
): Promise<MusicBrainzRelease[]> {
  const releases: MusicBrainzRelease[] = [];
  for (let page = 0; page < MAX_RELEASE_PAGES; page++) {
    const res = await musicBrainzFetch(
      `release?release-group=${encodeURIComponent(releaseGroupId)}&status=official&inc=media+labels+artist-credits&limit=${RELEASE_PAGE_SIZE}&offset=${page * RELEASE_PAGE_SIZE}&fmt=json`,
      budgetSignal,
    );
    if (!res.ok) throw new AlbumDetailsUnavailableError();

    const data = (await res.json()) as ReleaseBrowseResult;
    const batch = data.releases ?? [];
    releases.push(...batch);
    if (batch.length === 0 || releases.length >= (data['release-count'] ?? 0)) break;
  }
  return releases;
}

async function lookUpTracklist(releaseId: string, budgetSignal: AbortSignal): Promise<AlbumDisc[]> {
  const res = await musicBrainzFetch(
    `release/${encodeURIComponent(releaseId)}?inc=recordings&fmt=json`,
    budgetSignal,
  );
  if (!res.ok) throw new AlbumDetailsUnavailableError();

  const data = (await res.json()) as ReleaseLookupResult;
  return toDiscs(data.media ?? []);
}

async function moreFromArtist(
  release: MusicBrainzRelease,
  slug: string,
  releaseGroupId: string,
  budgetSignal: AbortSignal,
): Promise<AlbumDetailsResponse['moreFromArtist']> {
  const credited = release['artist-credit']?.[0]?.artist;
  // A compilation's "artist" is Various Artists, whose catalogue is nobody's albums.
  if (!credited?.id || credited.id === VARIOUS_ARTISTS_ID) return null;

  const catalogue = await browseArtistAlbums(credited.id, budgetSignal).catch(() => null);
  if (!catalogue) {
    logger.warn({ slug }, 'album details: artist albums unavailable');
    return null;
  }
  return {
    artist: credited.name ?? release['artist-credit']?.[0]?.name ?? '',
    albums: relatedAlbums(catalogue, releaseGroupId),
  };
}

/**
 * Release info, tracklist and more from the artist for a stored album, or null if the slug isn't
 * stored. The release info and tracklist are required: if MusicBrainz can't supply them this
 * throws, so a gap is never shown as if the album had no tracks. Every request here is cached by
 * musicBrainzFetch, so only the first view of an album waits on MusicBrainz.
 */
export async function getAlbumDetails(
  albums: AlbumRepository,
  slug: string,
  budgetSignal: AbortSignal = AbortSignal.timeout(DETAILS_BUDGET_MS),
): Promise<AlbumDetailsResponse | null> {
  const album = await albums.findBySlug(slug);
  if (!album) return null;

  const releases = await browseReleases(album.releaseGroupId, budgetSignal);
  const chosen = chooseRelease(releases);
  if (!chosen) return { release: null, formats: [], discs: [], moreFromArtist: null };

  const discs = await lookUpTracklist(chosen.id, budgetSignal);
  return {
    release: releaseInfo(chosen),
    formats: formatsOf(releases),
    discs,
    moreFromArtist: await moreFromArtist(chosen, slug, album.releaseGroupId, budgetSignal),
  };
}
