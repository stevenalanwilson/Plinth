import { AlbumRepository, NewAlbum, StoredAlbum } from './albumRepository';

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryAlbumRepository(): AlbumRepository {
  const byReleaseGroupId = new Map<string, StoredAlbum>();

  return {
    async findBySlug(slug: string): Promise<StoredAlbum | null> {
      return [...byReleaseGroupId.values()].find((album) => album.slug === slug) ?? null;
    },

    async findByReleaseGroupId(releaseGroupId: string): Promise<StoredAlbum | null> {
      return byReleaseGroupId.get(releaseGroupId) ?? null;
    },

    async insert(album: NewAlbum): Promise<StoredAlbum> {
      const existing = byReleaseGroupId.get(album.releaseGroupId);
      if (existing) return existing;

      // Mirrors the unique constraint on albums.slug.
      if ([...byReleaseGroupId.values()].some((stored) => stored.slug === album.slug)) {
        throw new Error(`Slug already in use: ${album.slug}`);
      }

      const stored: StoredAlbum = { ...album, genres: [...album.genres], createdAt: new Date() };
      byReleaseGroupId.set(album.releaseGroupId, stored);
      return stored;
    },
  };
}
