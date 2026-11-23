import { Request, Response } from 'express';
import { AlbumSearchResponse } from '@shared/types';
import { albumSearchQuerySchema } from '../schemas/albumSchemas';
import { searchAlbums } from '../services/albumSearchService';

/** GET /albums/search?q=: albums whose title or artist matches what has been typed. */
export async function handleAlbumSearch(req: Request, res: Response): Promise<void> {
  const query = albumSearchQuerySchema.safeParse(req.query.q);
  if (!query.success) {
    res.status(400).json({ error: 'q must be between 2 and 80 characters' });
    return;
  }

  const outcome = await searchAlbums(query.data);
  if (outcome.status === 'unavailable') {
    // Not kept, so asking again once MusicBrainz has recovered isn't answered with the failure.
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Album search is unavailable right now. Please try again.' });
    return;
  }

  const body: AlbumSearchResponse = { results: outcome.results };
  // Typing the same few letters again shouldn't ask again.
  res.set('Cache-Control', 'public, max-age=300');
  res.json(body);
}
