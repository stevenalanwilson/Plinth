import { AlbumRepository, NewAlbum } from '../repositories/albumRepository';
import { toSlug } from '../utils/musicNames';

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
