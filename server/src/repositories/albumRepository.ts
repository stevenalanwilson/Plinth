export interface NewAlbum {
  readonly releaseGroupId: string;
  readonly slug: string;
  readonly artist: string;
  readonly album: string;
  readonly year: string | null;
  readonly hook: string | null;
  readonly genres: readonly string[];
  readonly country: string | null;
}

export interface StoredAlbum extends NewAlbum {
  readonly createdAt: Date;
}

/** Albums that have a permalink. The MusicBrainz release group ID identifies each one. */
export interface AlbumRepository {
  findBySlug(slug: string): Promise<StoredAlbum | null>;
  findByReleaseGroupId(releaseGroupId: string): Promise<StoredAlbum | null>;
  /**
   * Saves the album unless its release group is already stored, and returns the stored album,
   * so the first save wins. Rejects if the slug belongs to a different album.
   */
  insert(album: NewAlbum): Promise<StoredAlbum>;
}
