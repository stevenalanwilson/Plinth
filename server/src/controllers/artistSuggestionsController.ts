import { Request, Response } from 'express';
import { ArtistSuggestionsResponse } from '@shared/types';
import { suggestArtists } from '../services/artistSuggestionService';

/** GET /artist-suggestions?q=: artists whose names start with what has been typed so far. */
export async function handleArtistSuggestions(req: Request, res: Response): Promise<void> {
  const { q } = req.query;

  if (typeof q !== 'string') {
    res.status(400).json({ error: 'q query param is required' });
    return;
  }

  const body: ArtistSuggestionsResponse = { suggestions: await suggestArtists(q) };
  // Typing the same few letters again shouldn't ask again. But none can mean MusicBrainz was
  // busy rather than that nobody matches, and that mustn't be kept.
  res.set('Cache-Control', body.suggestions.length > 0 ? 'public, max-age=300' : 'no-store');
  res.json(body);
}
