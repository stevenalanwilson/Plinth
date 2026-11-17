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

export interface AlbumArtwork {
  readonly artworkUrl: string | null;
  readonly appleMusicUrl: string | null;
}

export interface ArtworkLookup extends AlbumArtwork {
  readonly checkedAt: Date;
}

export interface StoredAlbum extends NewAlbum, AlbumArtwork {
  /** When artwork was last looked up; null until the first lookup. */
  readonly artworkCheckedAt: Date | null;
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
  /** Records an artwork lookup, including one that found nothing. Null if the album isn't stored. */
  updateArtwork(releaseGroupId: string, lookup: ArtworkLookup): Promise<StoredAlbum | null>;
  /** The most recently stored albums that have both a cover and a hook, newest first. */
  findRecentWithCoverAndHook(limit: number): Promise<StoredAlbum[]>;
}
