import { Request, Response } from 'express';
import { fetchArtwork } from '../services/artworkService';
import { logger } from '../logger';

const MUSICBRAINZ_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleArtwork(req: Request, res: Response): Promise<void> {
  const { artist, album, releaseGroupId } = req.query;

  if (typeof artist !== 'string' || typeof album !== 'string') {
    res.status(400).json({ error: 'artist and album query params are required' });
    return;
  }

  // The ID ends up in a Cover Art Archive URL, so only a MusicBrainz ID is accepted.
  if (
    releaseGroupId !== undefined &&
    (typeof releaseGroupId !== 'string' || !MUSICBRAINZ_ID.test(releaseGroupId))
  ) {
    res.status(400).json({ error: 'releaseGroupId must be a MusicBrainz ID' });
    return;
  }

  try {
    const artwork = await fetchArtwork(artist, album, releaseGroupId);
    res.json(artwork);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message, artist, album }, 'artwork fetch failed');
    res.status(502).json({ error: 'Failed to fetch artwork.' });
  }
}
