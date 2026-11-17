import { Request, Response } from 'express';
import { AlbumRepository } from '../repositories/albumRepository';
import { slugSchema } from '../schemas/albumSchemas';
import { AlbumDetailsUnavailableError, getAlbumDetails } from '../services/albumDetailsService';
import { logger } from '../logger';

export function createAlbumDetailsHandler(
  albums: AlbumRepository,
): (req: Request, res: Response) => Promise<void> {
  return (req, res) => handleAlbumDetails(req, res, albums);
}

async function handleAlbumDetails(
  req: Request,
  res: Response,
  albums: AlbumRepository,
): Promise<void> {
  const slug = slugSchema.safeParse(req.params.slug);
  if (!slug.success) {
    res.status(400).json({ error: 'slug must be words of letters or digits joined by hyphens' });
    return;
  }

  try {
    const details = await getAlbumDetails(albums, slug.data);
    if (!details) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }
    res.json(details);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message, slug: slug.data }, 'album details failed');
    if (error instanceof AlbumDetailsUnavailableError) {
      res.status(502).json({ error: "Couldn't load the album details. Please try again." });
      return;
    }
    res.status(500).json({ error: 'Failed to load album details.' });
  }
}
