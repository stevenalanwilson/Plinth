import { Pool } from 'pg';
import { AlbumRepository, NewAlbum, StoredAlbum } from './albumRepository';

interface AlbumRow {
  release_group_id: string;
  slug: string;
  artist: string;
  album: string;
  year: string | null;
  hook: string | null;
  genres: string[];
  country: string | null;
  created_at: Date;
}

const COLUMNS = 'release_group_id, slug, artist, album, year, hook, genres, country, created_at';

function toStoredAlbum(row: AlbumRow): StoredAlbum {
  return {
    releaseGroupId: row.release_group_id,
    slug: row.slug,
    artist: row.artist,
    album: row.album,
    year: row.year,
    hook: row.hook,
    genres: row.genres,
    country: row.country,
    createdAt: row.created_at,
  };
}

export function createPostgresAlbumRepository(pool: Pool): AlbumRepository {
  async function findOne(where: string, value: string): Promise<StoredAlbum | null> {
    const { rows } = await pool.query<AlbumRow>(
      `SELECT ${COLUMNS} FROM albums WHERE ${where} = $1`,
      [value],
    );
    return rows[0] ? toStoredAlbum(rows[0]) : null;
  }

  return {
    findBySlug: (slug) => findOne('slug', slug),
    findByReleaseGroupId: (releaseGroupId) => findOne('release_group_id', releaseGroupId),

    async insert(album: NewAlbum): Promise<StoredAlbum> {
      // One statement, so two requests saving the same album at once can't both insert: the
      // loser's INSERT does nothing and the second SELECT returns the winner's row.
      const { rows } = await pool.query<AlbumRow>(
        `WITH inserted AS (
           INSERT INTO albums (release_group_id, slug, artist, album, year, hook, genres, country)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (release_group_id) DO NOTHING
           RETURNING ${COLUMNS}
         )
         SELECT ${COLUMNS} FROM inserted
         UNION ALL
         SELECT ${COLUMNS} FROM albums WHERE release_group_id = $1
         LIMIT 1`,
        [
          album.releaseGroupId,
          album.slug,
          album.artist,
          album.album,
          album.year,
          album.hook,
          album.genres,
          album.country,
        ],
      );
      return toStoredAlbum(rows[0]);
    },
  };
}
