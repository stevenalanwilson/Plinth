import { Request, Response } from 'express';
import {
  getArtistEssentials,
  UnverifiedEssentialsError,
} from '../services/artistEssentialsService';
import { logger } from '../logger';
import { DailyLimitError, DailyPickLimiter } from '../services/dailyLimitService';
import { respondLimitReached, visitorOf } from './dailyLimitHandling';

type Handler = (req: Request, res: Response) => Promise<void>;

/**
 * An artist's essentials cost a Claude call as a pick does, so they are counted against the same
 * daily allowance. Otherwise this is a way round the limit.
 */
export function createArtistEssentialsHandler(dailyLimit: DailyPickLimiter): Handler {
  return (req, res) => handleArtistEssentials(req, res, dailyLimit);
}

async function handleArtistEssentials(
  req: Request,
  res: Response,
  dailyLimit: DailyPickLimiter,
): Promise<void> {
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
    // After the request is known to be valid, so a mistake in it doesn't use up a pick.
    await dailyLimit.consume(visitorOf(req, res));
    const result = await getArtistEssentials({ artist: artist.trim() });
    res.json(result);
  } catch (error) {
    if (error instanceof DailyLimitError) {
      respondLimitReached(res, error);
      return;
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message }, 'artist essentials request failed');
    res.status(502).json({
      error:
        error instanceof UnverifiedEssentialsError
          ? "Couldn't find albums we could verify for that artist. Check the name and try again."
          : 'Failed to get artist essentials. Please try again.',
    });
  }
}
