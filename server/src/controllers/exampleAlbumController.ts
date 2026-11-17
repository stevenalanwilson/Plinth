import { Request, Response } from 'express';
import { AlbumRepository } from '../repositories/albumRepository';
import { getExampleAlbum } from '../services/albumService';
import { logger } from '../logger';

// Long enough that a visitor reloading the page isn't a new query each time, short enough that
// new picks soon start showing up.
const EXAMPLE_CACHE_SECONDS = 300;

export function createExampleAlbumHandler(
  albums: AlbumRepository,
): (req: Request, res: Response) => Promise<void> {
  return async (_req, res) => {
    try {
      const album = await getExampleAlbum(albums);
      if (!album) {
        res.status(404).json({ error: 'No example album yet' });
        return;
      }
      res.set('Cache-Control', `public, max-age=${EXAMPLE_CACHE_SECONDS}`);
      res.json(album);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'example album lookup failed');
      res.status(500).json({ error: 'Failed to load an example album.' });
    }
  };
}
