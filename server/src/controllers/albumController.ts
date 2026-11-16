import { Request, Response } from 'express';
import { AlbumRepository } from '../repositories/albumRepository';
import { slugSchema } from '../schemas/albumSchemas';
import { getAlbum } from '../services/albumService';
import { logger } from '../logger';

export function createAlbumHandler(
  albums: AlbumRepository,
): (req: Request, res: Response) => Promise<void> {
  return (req, res) => handleAlbum(req, res, albums);
}

async function handleAlbum(req: Request, res: Response, albums: AlbumRepository): Promise<void> {
  const slug = slugSchema.safeParse(req.params.slug);
  if (!slug.success) {
    res.status(400).json({ error: 'slug must be words of letters or digits joined by hyphens' });
    return;
  }

  try {
    const album = await getAlbum(albums, slug.data);
    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }
    res.json(album);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message, slug: slug.data }, 'album lookup failed');
    res.status(500).json({ error: 'Failed to load album.' });
  }
}
