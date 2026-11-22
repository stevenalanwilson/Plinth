import { AlbumRepository, ArtworkLookup, NewAlbum, StoredAlbum } from './albumRepository';

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

      const stored: StoredAlbum = {
        ...album,
        genres: [...album.genres],
        artworkUrl: null,
        appleMusicUrl: null,
        artworkCheckedAt: null,
        createdAt: new Date(),
      };
      byReleaseGroupId.set(album.releaseGroupId, stored);
      return stored;
    },

    async updateArtwork(
      releaseGroupId: string,
      lookup: ArtworkLookup,
    ): Promise<StoredAlbum | null> {
      const existing = byReleaseGroupId.get(releaseGroupId);
      if (!existing) return null;

      const updated: StoredAlbum = {
        ...existing,
        artworkUrl: lookup.artworkUrl,
        appleMusicUrl: lookup.appleMusicUrl,
        artworkCheckedAt: lookup.checkedAt,
      };
      byReleaseGroupId.set(releaseGroupId, updated);
      return updated;
    },
  };
}
