import { Request, Response } from 'express';
import { getArtistEssentials } from '../services/artistEssentialsService';
import { logger } from '../logger';

export async function handleArtistEssentials(req: Request, res: Response): Promise<void> {
  const { artist } = req.body as Record<string, unknown>;

  if (typeof artist !== 'string' || artist.trim() === '') {
    res.status(400).json({ error: 'artist must be a non-empty string' });
    return;
  }

  if (artist.length > 100) {
    res.status(400).json({ error: 'artist must be 100 characters or fewer' });
    return;
  }

  try {
    const result = await getArtistEssentials({ artist: artist.trim() });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message }, 'artist essentials request failed');
    res.status(502).json({ error: 'Failed to get artist essentials. Please try again.' });
  }
}
