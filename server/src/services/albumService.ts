import { AlbumResponse } from '@shared/types';
import { AlbumRepository, NewAlbum, StoredAlbum } from '../repositories/albumRepository';
import { toSlug } from '../utils/musicNames';
import { logger } from '../logger';
import { fetchArtwork } from './artworkService';
import { isCutHook } from '../utils/hookText';

export type AlbumToSave = Omit<NewAlbum, 'slug'>;

// Enough of the release group ID to tell two same-named albums apart in a readable URL.
const SLUG_SUFFIX_LENGTH = 6;

async function availableSlug(albums: AlbumRepository, album: AlbumToSave): Promise<string> {
  const suffix = album.releaseGroupId.slice(0, SLUG_SUFFIX_LENGTH);
  const base = toSlug(`${album.artist} ${album.album}`);
  if (base === '') return `album-${suffix}`;

  // e.g. two self-titled albums by one artist, or two bands sharing a name.
  const owner = await albums.findBySlug(base);
  return owner ? `${base}-${suffix}` : base;
}

/**
 * Gives the album a permalink and returns its slug. An album already stored keeps the slug and
 * details it was first saved with, because slugs are public URLs that must never change.
 */
export async function saveAlbum(albums: AlbumRepository, album: AlbumToSave): Promise<string> {
  const existing = await albums.findByReleaseGroupId(album.releaseGroupId);
  if (existing) return existing.slug;

  const stored = await albums.insert({ ...album, slug: await availableSlug(albums, album) });
  return stored.slug;
}

// A missing cover is often temporary (the Cover Art Archive was busy, or art was added later),
// so look again after an hour. A found cover is kept for good.
const MISSING_ARTWORK_RECHECK_MS = 60 * 60 * 1000;

function needsArtworkLookup(album: StoredAlbum, now: Date): boolean {
  if (!album.artworkCheckedAt) return true;
  if (album.artworkUrl) return false;
  return now.getTime() - album.artworkCheckedAt.getTime() >= MISSING_ARTWORK_RECHECK_MS;
}

async function withArtwork(
  albums: AlbumRepository,
  album: StoredAlbum,
  now: Date,
): Promise<StoredAlbum> {
  try {
    const artwork = await fetchArtwork(album.artist, album.album, album.releaseGroupId);
    const updated = await albums.updateArtwork(album.releaseGroupId, {
      artworkUrl: artwork.artworkUrl,
      appleMusicUrl: artwork.appleMusicUrl,
      checkedAt: now,
    });
    return updated ?? album;
  } catch (error) {
    // Not recorded as checked, so the next view tries again.
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), slug: album.slug },
      'album artwork lookup failed',
    );
    return album;
  }
}

function toAlbumResponse(album: StoredAlbum): AlbumResponse {
  return {
    slug: album.slug,
    releaseGroupId: album.releaseGroupId,
    artist: album.artist,
    album: album.album,
    year: album.year,
    hook: album.hook,
    genres: album.genres,
    country: album.country,
    artworkUrl: album.artworkUrl,
    appleMusicUrl: album.appleMusicUrl,
  };
}

/**
 * Returns the album with its cover and listening links, or null if the slug isn't stored. The
 * artwork lookup runs once and is kept, so later views don't touch any outside service.
 */
export async function getAlbum(
  albums: AlbumRepository,
  slug: string,
  now: Date = new Date(),
): Promise<AlbumResponse | null> {
  const stored = await albums.findBySlug(slug);
  if (!stored) return null;

  const album = needsArtworkLookup(stored, now) ? await withArtwork(albums, stored, now) : stored;
  return toAlbumResponse(album);
}

// Recent enough to rotate as new picks are made, big enough that two visits rarely match.
const EXAMPLE_POOL_SIZE = 50;

export type ChooseIndex = (count: number) => number;

const randomIndex: ChooseIndex = (count) => Math.floor(Math.random() * count);

/**
 * A real album to show first-time visitors, chosen from recent picks that have a cover and a
 * hook. Only the hook is shown, never the reason, because the hook doesn't depend on whoever
 * the album was picked for. Null until some album qualifies.
 */
export async function getExampleAlbum(
  albums: AlbumRepository,
  chooseIndex: ChooseIndex = randomIndex,
): Promise<AlbumResponse | null> {
  const recent = await albums.findRecentWithCoverAndHook(EXAMPLE_POOL_SIZE);
  // A hook cut short with an ellipsis is a poor first impression, so those are only shown when
  // nothing else qualifies. Hooks are stored once and never rewritten, so older ones stay cut.
  const whole = recent.filter((album) => album.hook && !isCutHook(album.hook));
  const candidates = whole.length > 0 ? whole : recent;
  if (candidates.length === 0) return null;

  const index = Math.min(Math.max(chooseIndex(candidates.length), 0), candidates.length - 1);
  return toAlbumResponse(candidates[index]);
}
